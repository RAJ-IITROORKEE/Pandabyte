import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';

const LIMIT = 8 * 1024 * 1024;
const probe = `<script>
(() => {
  const root = document.documentElement;
  const initialReadyState = document.readyState;
  let sensorStartedAt = null;
  root.setAttribute('data-panda-baseline-state', 'running');
  function show(label, value) {
    const panel = document.createElement('section');
    panel.id = 'panda-baseline-panel';
    const title = document.createElement('strong');
    title.textContent = label;
    const pre = document.createElement('pre');
    pre.id = 'panda-baseline-report';
    pre.textContent = JSON.stringify(value, null, 2);
    panel.append(title, pre);
    (document.body || root).append(panel);
  }
  function fail() {
    root.setAttribute('data-panda-baseline-state', 'error');
    show('LOCAL MEASUREMENT ERROR', { label: 'LOCAL MEASUREMENT ERROR', message: 'Browser measurement API unavailable or failed.', sensorStartedAt, initialReadyState });
  }
  try {
    sensorStartedAt = performance.now();
    let last = sensorStartedAt, done = false, overflow = false;
    performance.setResourceTimingBufferSize(2000);
    performance.addEventListener('resourcetimingbufferfull', () => { overflow = true; });
    const observer = new PerformanceObserver(() => { last = performance.now(); });
    observer.observe({ type: 'resource', buffered: true });
    function finish(reason) {
      if (done) return;
      done = true;
      observer.disconnect();
      const entries = performance.getEntriesByType('resource'), first = [], third = [];
      for (const e of entries) {
        let u;
        try { u = new URL(e.name); } catch { continue; }
        if (u.origin === location.origin && /^\\/_next\\/static\\/.*\\.js$/.test(u.pathname)) first.push({ path: u.pathname, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize, startTime: e.startTime, responseEnd: e.responseEnd, workerStart: e.workerStart });
        else if (u.origin !== location.origin && e.initiatorType === 'script') third.push(e);
      }
      const sum = (a, k) => a.reduce((n, e) => n + e[k], 0);
      const nav = performance.getEntriesByType('navigation')[0];
      const allCold = !overflow && first.length > 0 && first.every(e => e.transferSize > 0 && e.encodedBodySize > 0 && e.workerStart === 0);
      const report = {
        label: 'LOCAL MEASUREMENT', route: location.pathname,
        viewport: { width: innerWidth, height: innerHeight }, userAgent: navigator.userAgent,
        navigation: nav ? { startTime: nav.startTime, loadEventEnd: nav.loadEventEnd } : null,
        capture: { reason, cutoffMs: performance.now(), quietWindowMs: 3000, maxAfterLoadMs: 15000, resourceBufferOverflow: overflow, sensorStartedAt, initialReadyState },
        firstParty: { entries: first, count: first.length, uniquePaths: new Set(first.map(e => e.path)).size, transferSize: sum(first, 'transferSize'), encodedBodySize: sum(first, 'encodedBodySize'), decodedBodySize: sum(first, 'decodedBodySize'), positiveTransfer: allCold, cacheMissEvidence: allCold },
        thirdPartyScripts: { count: third.length, visibleTransferSize: sum(third, 'transferSize'), visibleEncodedBodySize: sum(third, 'encodedBodySize'), visibleDecodedBodySize: sum(third, 'decodedBodySize'), unknownTimingCount: third.filter(e => e.transferSize === 0 && e.encodedBodySize === 0).length },
        probeBytes: __PROBE_BYTES__
      };
      root.setAttribute('data-panda-baseline-state', 'complete');
      show('LOCAL MEASUREMENT — ' + reason, report);
    }
    function start() {
      try {
        const loaded = performance.now();
        last = loaded;
        const timer = setInterval(() => {
          try {
            const now = performance.now();
            if (now - loaded >= 15000) { clearInterval(timer); finish('maximum'); }
            else if (now - last >= 3000) { clearInterval(timer); finish('quiet'); }
          } catch { clearInterval(timer); fail(); }
        }, 100);
      } catch { fail(); }
    }
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  } catch { fail(); }
})();
</script>`;
// A fixed-width field keeps the measured inline byte count equal to the inserted bytes.
function permittedNonce(header) {
  if (!header) return '';
  if (typeof header !== 'string' || header.length > 16384) return null;
  let allowed = null;
  for (const policy of header.split(',')) {
    const directives = new Map();
    for (const part of policy.split(';')) {
      const [name, ...values] = part.trim().split(/\s+/);
      if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values);
    }
    const sandbox = directives.get('sandbox');
    if (sandbox && !sandbox.includes('allow-scripts')) return null;
    const sources = directives.get('script-src-elem') ?? directives.get('script-src') ?? directives.get('default-src');
    if (!sources) continue;
    const nonces = sources.map(source => /^'nonce-([A-Za-z0-9+/_-]{1,252}={0,2})'$/.exec(source)?.[1]).filter(Boolean);
    if (nonces.length) allowed = allowed === null ? nonces : allowed.filter(value => nonces.includes(value));
    else if (!sources.includes("'unsafe-inline'") || sources.some(source => /^'sha(?:256|384|512)-/.test(source) || source === "'strict-dynamic'")) return null;
  }
  return allowed === null ? '' : allowed[0] ?? null;
}
function makeProbe(nonce) {
  const script = nonce ? probe.replace('<script>', `<script nonce="${nonce}">`) : probe;
  return script.replace('__PROBE_BYTES__', String(Buffer.byteLength(script) - '__PROBE_BYTES__'.length + 6).padStart(6, ' '));
}
const sha = b => createHash('sha256').update(b).digest('hex');
const decode = (body, encoding) => {
  const opts = { maxOutputLength: LIMIT };
  if (!encoding || encoding === 'identity') return body;
  if (encoding === 'gzip') return gunzipSync(body, opts);
  if (encoding === 'br') return brotliDecompressSync(body, opts);
  if (encoding === 'deflate') return inflateSync(body, opts);
  throw new Error('unsupported encoding');
};
const hops = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
const newCapture = runRoute => ({ runRoute, probeBytes: 0, measurementError: null, assets: [], assetOverflow: false, counterOverflow: false, started: 0, completed: 0, inFlight: 0, failed: 0 });
function increment(capture, key) {
  if (capture[key] === Number.MAX_SAFE_INTEGER) capture.counterOverflow = true;
  else capture[key]++;
}

export function createBaselineProxy({ upstreamHost = '::1', upstreamPort = 3012, buildDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../.next-lightweight-baseline') } = {}) {
  if (!['::1', '127.0.0.1'].includes(upstreamHost) || !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) throw new TypeError('Invalid loopback upstream');
  let capture = newCapture(null);
  return http.createServer((req, res) => {
    const fail = status => { if (!res.headersSent) res.writeHead(status, { 'Cache-Control': 'no-store' }); res.end(); };
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
    if (!req.url || req.url.length > 2048 || !req.url.startsWith('/') || req.url.startsWith('//')) return fail(414);
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { return fail(400); }
    if (url.pathname === '/__panda-baseline/report') {
      const body = Buffer.from(JSON.stringify(capture));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    const target = req.method === 'GET' && (url.pathname === '/' || url.pathname === '/panda-agent') && /(?:^|[,\s])text\/html(?:[;,\s]|$)/i.test(req.headers.accept || '') && !req.headers.rsc;
    let current = capture;
    const asset = req.method === 'GET' && /^\/_next\/static\/[a-zA-Z0-9_./-]+\.js$/.test(url.pathname) && !url.pathname.split('/').includes('..');
    let settled = false;
    if (asset) { increment(current, 'started'); increment(current, 'inFlight'); }
    const settle = (completed, failed) => {
      if (!asset || settled) return;
      settled = true;
      if (current.inFlight > 0) current.inFlight--;
      if (completed) increment(current, 'completed');
      if (failed) increment(current, 'failed');
    };
    const headers = { ...req.headers };
    for (const key of [...hops, 'if-none-match', 'if-modified-since']) delete headers[key];
    const upstream = http.request({ hostname: upstreamHost, port: upstreamPort, path: req.url, method: req.method, headers }, response => {
      const outputHeaders = { ...response.headers, 'cache-control': 'no-store' };
      for (const key of [...hops, 'etag']) delete outputHeaders[key];
      const html = target && /^text\/html\b/i.test(String(response.headers['content-type'] || '')) && response.statusCode === 200;
      if (html) capture = current = newCapture(url.pathname);
      if (req.method === 'HEAD') { res.writeHead(response.statusCode, outputHeaders); response.resume(); return res.end(); }
      const chunks = []; let size = 0, aborted = false;
      response.on('data', chunk => { size += chunk.length; if (size > (html ? 2 * 1024 * 1024 : LIMIT)) { aborted = true; settle(false, true); response.destroy(); fail(502); } else chunks.push(chunk); });
      response.on('error', () => { settle(false, true); if (!aborted) fail(502); });
      response.on('aborted', () => { settle(false, true); if (!aborted) fail(502); });
      response.on('end', () => {
        if (aborted) return;
        settle(true, response.statusCode < 200 || response.statusCode >= 300);
        let body = Buffer.concat(chunks);
        if (html) {
          const nonce = permittedNonce(response.headers['content-security-policy']);
          if (nonce === null) {
            current.measurementError = 'Inline measurement blocked by Content Security Policy';
            delete outputHeaders['content-encoding']; delete outputHeaders['content-length'];
            res.writeHead(502, outputHeaders); return res.end();
          }
          try {
            const decoded = decode(body, response.headers['content-encoding']);
            if (decoded.length > 2 * 1024 * 1024) return fail(502);
            const text = decoded.toString('utf8'); const head = /<head(?:\s[^>]*)?>/i.exec(text);
            if (!head) return fail(502);
            const at = head.index + head[0].length;
            const inlineProbe = makeProbe(nonce);
            body = Buffer.from(text.slice(0, at) + inlineProbe + text.slice(at));
            current.probeBytes = Buffer.byteLength(inlineProbe); delete outputHeaders['content-encoding']; delete outputHeaders['content-length'];
          } catch { return fail(502); }
        }
        if (asset && current.assets.length >= 256) current.assetOverflow = true;
        if (asset && current.assets.length < 256) {
          const row = { path: url.pathname, status: response.statusCode, rawBytes: body.length, contentEncoding: String(response.headers['content-encoding'] || 'identity').match(/^(gzip|br|deflate|identity)$/)?.[0] || 'other', decodedSha256: null, localSha256: null };
          try { row.decodedSha256 = sha(decode(body, response.headers['content-encoding'])); } catch {}
          try { row.localSha256 = sha(readFileSync(join(buildDir, url.pathname.slice('/_next/'.length)))); } catch {}
          current.assets.push(row);
        }
        outputHeaders['content-length'] = body.length;
        res.writeHead(response.statusCode, outputHeaders); res.end(body);
      });
    });
    const timeout = setTimeout(() => upstream.destroy(), 30000);
    res.on('close', () => clearTimeout(timeout));
    upstream.on('error', () => { settle(false, true); if (!res.destroyed) fail(502); });
    res.on('close', () => { if (!res.writableEnded) { settle(false, true); upstream.destroy(); } });
    upstream.end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createBaselineProxy().listen(3001, 'localhost', () => console.log('http://localhost:3001'));
}
