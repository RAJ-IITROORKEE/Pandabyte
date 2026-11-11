import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const { createRelay } = createRequire(import.meta.url)('../runtime/research-relay/index.js');
const id = '66666666-7777-4888-9999-aaaaaaaaaaaa', caller = 'arn:aws:iam::123456789012:role/panda-research-test-caller';
const config = () => ({ enabled: true, address: '172.31.18.90', port: 8444, serverName: 'panda-research.internal', ca: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----',
  serviceToken: randomBytes(32).toString('base64'), callerArn: caller, timeoutMs: 130000 });
const event = (kind = 'turn', over = {}) => {
  const resource = kind === 'turn' ? '/v1/research/turns' : `/v1/research/turns/{id}/${kind}`, path = kind === 'turn' ? resource : `/v1/research/turns/${id}/${kind}`;
  const accept = kind === 'turn' ? 'application/x-ndjson' : 'application/json';
  return { resource, path, httpMethod: 'POST', pathParameters: kind === 'turn' ? null : { id }, requestContext: { stage: 'research', identity: { userArn: caller.replace(':iam::', ':sts::').replace(':role/', ':assumed-role/') + '/vercel-session' } },
    headers: { 'Content-Type': 'application/json', Accept: accept }, multiValueHeaders: { 'Content-Type': ['application/json'], Accept: [accept] }, body: '{"dispatch":{},"mac":"x"}', isBase64Encoded: false, ...over };
};
// Like the Lambda HttpResponseStream, data must go through write(): end(chunk) would skip the metadata prelude.
const sink = () => { const s = new PassThrough(); const out = []; s.on('data', c => out.push(c)); s.text = () => Buffer.concat(out).toString(); const end = s.end.bind(s); s.end = (...a) => { assert.equal(typeof a[0] === 'object' || typeof a[0] === 'string', false, 'end(chunk) used'); return end(...a); }; return s; };
function run(ev, upstreamReply, cfg = config()) {
  const calls = [], destination = sink(); let meta = null;
  const relay = createRelay(cfg, async (options, body) => { calls.push({ options, body }); return upstreamReply; });
  return relay(ev, destination, m => { meta = m; return destination; }).then(r => ({ r, calls, meta, text: destination.text() }), e => ({ error: e, calls, meta }));
}
const reply = (status, type, chunks) => ({ statusCode: status, headers: { 'content-type': type }, body: Readable.from(chunks.map(c => Buffer.from(c))) });

test('turn streams NDJSON from the host with the service token and pinned TLS', async () => {
  const cfg = config(), out = await run(event(), reply(200, 'application/x-ndjson', ['{"type":"progress","stage":"admitted"}\n', '{"type":"result"}\n']), cfg);
  assert.deepEqual(out.r, { statusCode: 200 }); assert.equal(out.meta.headers['content-type'], 'application/x-ndjson');
  assert.equal(out.text, '{"type":"progress","stage":"admitted"}\n{"type":"result"}\n');
  const o = out.calls[0].options;
  assert.equal(o.path, '/v1/research/turns'); assert.equal(o.port, 8444); assert.equal(o.rejectUnauthorized, true); assert.equal(o.servername, 'panda-research.internal');
  assert.equal(o.headers.authorization, 'Bearer ' + cfg.serviceToken); assert.equal(out.calls[0].body, '{"dispatch":{},"mac":"x"}');
});

test('status and cancel map to the host id routes; stage-prefixed path accepted', async () => {
  for (const kind of ['status', 'cancel']) {
    const out = await run(event(kind), reply(200, 'application/json; charset=utf-8', ['{"payload":{}}']));
    assert.equal(out.r.statusCode, 200); assert.equal(out.calls[0].options.path, `/v1/research/turns/${id}/${kind}`);
  }
  const prefixed = await run(event('status', { path: `/research/v1/research/turns/${id}/status` }), reply(200, 'application/json', ['{}']));
  assert.equal(prefixed.r.statusCode, 200);
});

test('host 4xx/202 JSON passes through unchanged; other statuses become 503', async () => {
  for (const status of [202, 400, 403, 404, 409, 413]) {
    const out = await run(event('status'), reply(status, 'application/json', ['{"error":"conflict"}']));
    assert.equal(out.r.statusCode, status); assert.equal(out.meta.statusCode, status); assert.equal(out.text, '{"error":"conflict"}');
  }
  for (const [status, type] of [[401, 'application/json'], [500, 'application/json'], [404, 'text/html'], [200, 'text/html']])
    assert.deepEqual((await run(event('status'), reply(status, type, ['x']))).r, { statusCode: 503 });
  assert.deepEqual((await run(event('status'), reply(404, 'application/json', ['x'.repeat(2049)]))).r, { statusCode: 503 }, 'oversize error body');
});

test('rejects every request outside the allowlist without forwarding', async () => {
  const bad = [
    event('turn', { httpMethod: 'GET' }), event('turn', { resource: '/v1/turns', path: '/v1/turns' }), event('turn', { requestContext: { stage: 'agent', identity: event().requestContext.identity } }),
    event('status', { pathParameters: { id: id.toUpperCase() }, path: `/v1/research/turns/${id.toUpperCase()}/status` }), event('status', { path: `/v1/research/turns/${id}/cancel` }),
    event('status', { pathParameters: { id, extra: 'x' } }), event('turn', { queryStringParameters: { a: '1' } }), event('turn', { isBase64Encoded: true }),
    event('turn', { body: 'x'.repeat(16385) }), event('turn', { body: '[]' }), event('turn', { body: 'not json' }), event('turn', { body: '' }),
    event('turn', { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, multiValueHeaders: undefined }),
    event('status', { headers: { 'Content-Type': 'text/plain', Accept: 'application/json' }, multiValueHeaders: undefined }),
    event('turn', { multiValueHeaders: { Accept: ['application/x-ndjson', 'application/json'] } }),
    event('turn', { requestContext: { stage: 'research', identity: { userArn: 'arn:aws:iam::123456789012:root' } } }),
    event('turn', { requestContext: { stage: 'research', identity: { userArn: 'arn:aws:sts::123456789012:assumed-role/PandaAgentHostedVercel/x1' } } }),
  ];
  for (const [i, ev] of bad.entries()) { const out = await run(ev, reply(200, 'application/x-ndjson', ['{}'])); assert.deepEqual(out.r, { statusCode: 503 }, 'case ' + i); assert.equal(out.calls.length, 0, 'case ' + i); }
  for (const cfg of [{ ...config(), enabled: false }, { ...config(), port: 9443 }, { ...config(), address: '8.8.8.8' }, { ...config(), serviceToken: 'short' }, { ...config(), timeoutMs: 30000 }]) {
    const out = await run(event(), reply(200, 'application/x-ndjson', ['{}']), cfg); assert.deepEqual(out.r, { statusCode: 503 }); assert.equal(out.calls.length, 0);
  }
});

test('stream above the cap ends as an unknown outcome after opening', async () => {
  const out = await run(event(), reply(200, 'application/x-ndjson', ['x'.repeat(200000), 'x'.repeat(70000)]));
  assert.ok(out.error); assert.equal(out.meta.statusCode, 200);
  const connectorError = await createRelay(config(), async () => { throw Error('ECONNREFUSED'); })(event(), sink());
  assert.deepEqual(connectorError, { statusCode: 503 });
});

test('a status result near the D1 answer bound (about 25 KB) fits through the relay', async () => {
  const out = await run(event('status'), reply(200, 'application/json', ['{"a":"' + 'x'.repeat(30000) + '"}']));
  assert.equal(out.r.statusCode, 200); assert.equal(out.text.length, 30008);
});
