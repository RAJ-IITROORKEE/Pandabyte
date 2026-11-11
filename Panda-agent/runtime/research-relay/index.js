// Phase D3 research relay (new Lambda, separate from the hosted-agent relay). It forwards an IAM-authenticated
// API Gateway request to the private host research service. It authorizes nothing about the user: the host
// verifies the app-signed dispatch envelope. Every failure before streaming is a fixed 503; nothing is retried.
'use strict';
const https = require('node:https');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');
const { timingSafeEqual } = require('node:crypto');

const unavailable = Object.freeze({ statusCode: 503 });
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const privateV4 = v => {
  if (typeof v !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return false;
  const n = v.split('.').map(Number);
  return n.every((x, i) => x <= 255 && String(x) === v.split('.')[i]) && (n[0] === 10 || n[0] === 172 && n[1] >= 16 && n[1] <= 31 || n[0] === 192 && n[1] === 168);
};
const header = (headers, name) => {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return null;
  const found = Object.entries(headers).filter(([k]) => k.toLowerCase() === name);
  return found.length === 1 && typeof found[0][1] === 'string' ? found[0][1] : null;
};
const callerMatches = (expected, actual) => {
  const role = /^arn:aws:iam::([0-9]{12}):role\/([A-Za-z0-9+=,.@_-]{1,64})$/.exec(expected ?? '');
  if (!role || typeof actual !== 'string') return false;
  if (actual === expected) return true;
  const prefix = `arn:aws:sts::${role[1]}:assumed-role/${role[2]}/`;
  return actual.startsWith(prefix) && /^[A-Za-z0-9+=,.@_-]{2,64}$/.test(actual.slice(prefix.length));
};
const passThrough = new Set([202, 400, 403, 404, 409, 413]);
const routes = { '/v1/research/turns': 'turn', '/v1/research/turns/{id}/status': 'status', '/v1/research/turns/{id}/cancel': 'cancel' };

function connect(options, body, signal) {
  return new Promise((resolve, reject) => {
    const request = https.request({ ...options, signal }, r => resolve({ statusCode: r.statusCode, headers: r.headers, body: r }));
    request.once('error', reject); request.end(body);
  });
}

/** Returns the upstream path for an allowed event, else null. */
function route(event) {
  const kind = routes[event?.resource];
  if (!kind || event.httpMethod !== 'POST' || event.requestContext?.stage !== 'research') return null;
  const id = event.pathParameters?.id;
  if (kind === 'turn' ? event.pathParameters && Object.keys(event.pathParameters).length : !uuid(id) || Object.keys(event.pathParameters).length !== 1) return null;
  const upstream = kind === 'turn' ? '/v1/research/turns' : `/v1/research/turns/${id}/${kind}`;
  if (event.path !== upstream && event.path !== '/research' + upstream) return null;
  return { kind, upstream };
}

function createRelay(config, connector = connect) {
  return async (event, destination, open = () => destination) => {
    let opened = false, upstream, stream, timer;
    const controller = new AbortController();
    const disconnected = () => { if (!destination.writableFinished) controller.abort(); };
    const failed = () => controller.abort();
    destination.once('close', disconnected); destination.on('error', failed);
    try {
      if (config?.enabled !== true || !privateV4(config.address) || config.port !== 8444 || typeof config.serverName !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/.test(config.serverName)
        || !config.serverName.includes('.') || typeof config.ca !== 'string' || !config.ca || Buffer.byteLength(config.ca) > 16384 || config.timeoutMs !== 130000 || typeof connector !== 'function') return unavailable;
      const target = route(event);
      if (!target || event.isBase64Encoded === true || event.queryStringParameters && Object.keys(event.queryStringParameters).length
        || event.multiValueQueryStringParameters && Object.keys(event.multiValueQueryStringParameters).length
        || typeof event.body !== 'string' || !event.body || Buffer.byteLength(event.body) > 16384) return unavailable;
      if (event.multiValueHeaders && Object.entries(event.multiValueHeaders).some(([k, v]) => ['authorization', 'content-type', 'accept'].includes(k.toLowerCase())
        && (!Array.isArray(v) || v.length !== 1 || v[0] !== header(event.headers, k.toLowerCase())))) return unavailable;
      const type = header(event.headers, 'content-type'), accept = header(event.headers, 'accept');
      const token = Buffer.from(String(config.serviceToken ?? ''), 'base64');
      if (!callerMatches(config.callerArn, event?.requestContext?.identity?.userArn) || token.length !== 32 || token.toString('base64') !== config.serviceToken
        || type !== 'application/json' || accept !== (target.kind === 'turn' ? 'application/x-ndjson' : 'application/json')) return unavailable;
      let payload; try { payload = JSON.parse(event.body); } catch { return unavailable; }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return unavailable;
      const options = { hostname: config.address, port: config.port, servername: config.serverName, ca: config.ca, rejectUnauthorized: true, method: 'POST', path: target.upstream,
        headers: { authorization: 'Bearer ' + config.serviceToken, accept, 'content-type': 'application/json', 'content-length': Buffer.byteLength(event.body) } };
      timer = setTimeout(() => controller.abort(), config.timeoutMs);
      upstream = await connector(options, event.body, controller.signal);
      if (controller.signal.aborted) throw Error('disconnected');
      const ctype = typeof upstream?.headers?.['content-type'] === 'string' ? upstream.headers['content-type'] : '';
      const json = /^application\/json(?:\s*;|$)/i.test(ctype);
      if (upstream?.statusCode !== 200 && passThrough.has(upstream?.statusCode) && json && upstream.body) {
        // A small fixed-shape host JSON error/status, relayed unchanged so the app can tell conflict/not-found/running apart.
        let bytes = 0; const chunks = [];
        for await (const chunk of upstream.body) { bytes += chunk.length; if (bytes > 2048) { upstream.body.destroy(); return unavailable; } chunks.push(chunk); }
        stream = open({ statusCode: upstream.statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
        // write(), never end(chunk): the Lambda stream emits its metadata prelude on the first write() call
        opened = true; stream.write(Buffer.concat(chunks)); stream.end(); await finished(stream, { signal: controller.signal }); return { statusCode: upstream.statusCode };
      }
      if (upstream?.statusCode !== 200 || !upstream.body || !new RegExp(`^${accept.replace('/', '\\/')}(?:\\s*;|$)`, 'i').test(ctype)) { upstream?.body?.destroy(); return unavailable; }
      stream = open({ statusCode: 200, headers: { 'content-type': accept, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      if (stream !== destination) stream.on('error', failed);
      opened = true; let bytes = 0; const cap = accept === 'application/json' ? 65536 : 262144; // a signed result carries an answer of up to 24,000 B (D1 bound)
      for await (const chunk of upstream.body) {
        bytes += chunk.length; if (bytes > cap) throw Error('response_too_large');
        if (!stream.write(chunk)) await once(stream, 'drain', { signal: controller.signal });
      }
      stream.end(); await finished(stream, { signal: controller.signal }); return { statusCode: 200 };
    } catch {
      if (opened) { upstream?.body?.destroy(); stream?.destroy(); throw Error('Relay outcome unknown'); }
      upstream?.body?.destroy(); return unavailable;
    } finally {
      destination.removeListener('close', disconnected); destination.removeListener('error', failed);
      if (stream && stream !== destination) stream.removeListener('error', failed);
      clearTimeout(timer); controller.abort();
    }
  };
}

module.exports = { createRelay };

if (typeof globalThis.awslambda !== 'undefined') {
  // Configuration is server-owned; blank defaults keep the relay disabled.
  const relay = createRelay({
    enabled: process.env.PANDA_RESEARCH_RELAY_ENABLED === 'true',
    address: process.env.PANDA_RESEARCH_PRIVATE_IPV4,
    port: Number(process.env.PANDA_RESEARCH_PRIVATE_PORT),
    serverName: process.env.PANDA_RESEARCH_TLS_NAME,
    ca: process.env.PANDA_RESEARCH_CA_PEM,
    serviceToken: process.env.PANDA_RESEARCH_SERVICE_TOKEN,
    callerArn: process.env.PANDA_RESEARCH_CALLER_ARN,
    timeoutMs: Number(process.env.PANDA_RESEARCH_RELAY_TIMEOUT_MS),
  });
  module.exports.handler = globalThis.awslambda.streamifyResponse(async (event, response) => {
    let opened = false;
    const result = await relay(event, response, metadata => { opened = true; return globalThis.awslambda.HttpResponseStream.from(response, metadata); });
    if (!opened) {
      const s = globalThis.awslambda.HttpResponseStream.from(response, { statusCode: result.statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      s.write('{"error":"unavailable"}'); s.end();
    }
  });
}
