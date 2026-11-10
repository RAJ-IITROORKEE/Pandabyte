import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { searchHostedPublicWeb, hostedTavilyRequestHash, TavilySearchError } from '../src/search/tavily.ts';

const query = 'RP2040 PIO public documentation';
const item = { url: 'https://docs.public-site.org/guide', title: 'Guide', content: 'Exact snippet 😀 "quoted" \\ text' };
const response = (results = [item], extra = {}) => new Response(JSON.stringify({ results, ...extra }), { headers: { 'content-type': 'application/json' } });
const options = (overrides = {}) => ({ apiKey: 'fixture-key', beforeSend: async () => true, lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async () => response(), ...overrides });
const failure = (stage, code) => error => error instanceof TavilySearchError && error.stage === stage && error.code === code && !error.message.includes('private-provider-detail');

test('hosted request has one immediate durable authorization and exact fixed wire/hash/receipt', async () => {
  const events = []; let init;
  const receipt = await searchHostedPublicWeb(` ${query} `, options({
    beforeSend: async () => { events.push('grant'); return true; },
    fetchImpl: async (url, request) => { events.push('fetch'); assert.equal(url, 'https://api.tavily.com/search'); init = request; return response([item], { request_id: 'request-123', usage: { credits: 1 }, answer: 'ignored' }); },
    now: () => new Date('2026-11-11T00:00:00Z'),
  }));
  assert.deepEqual(events, ['grant', 'fetch']);
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
  assert.equal(init.headers.Authorization, 'Bearer fixture-key');
  const body = { query, search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false, include_usage: true };
  assert.deepEqual(JSON.parse(init.body), body);
  const canonical = JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(key => [key, body[key]])));
  assert.equal(receipt.requestHash, createHash('sha256').update(canonical).digest('hex'));
  assert.equal(hostedTavilyRequestHash(query), receipt.requestHash);
  assert.equal(hostedTavilyRequestHash(` ${query} `), receipt.requestHash);
  assert.deepEqual(Object.keys(receipt).sort(), ['version', 'provider', 'operation', 'requestHash', 'requestId', 'startedAt', 'completedAt', 'durationMs', 'usage', 'sources'].sort());
  assert.equal(receipt.version, 1); assert.equal(receipt.provider, 'tavily'); assert.equal(receipt.operation, 'search');
  assert.equal(receipt.requestId, 'request-123'); assert.deepEqual(receipt.usage, { credits: 1, costNanoUsd: null });
  assert.equal(receipt.startedAt, '2026-11-11T00:00:00.000Z'); assert.equal(receipt.completedAt, receipt.startedAt);
  assert.ok(Number.isFinite(receipt.durationMs) && receipt.durationMs >= 0);
  assert.equal(receipt.sources[0].content, item.content); assert.equal(receipt.sources[0].capturedAt, receipt.completedAt);
  const digest = value => createHash('sha256').update(value).digest('hex');
  assert.equal(receipt.sources[0].handle, `web:${digest(item.url)}:${digest(item.content)}:${digest(item.content)}`);
});

test('private, malformed and control queries reject before hook or send', async () => {
  let hooks = 0, sends = 0;
  for (const value of ['', 'x'.repeat(401), 'person@example.com', 'https://docs.public-site.org/', 'tvly-1234567890', 'token=secret', '12345678901', '\ud800', 'public\u200bguide', 'public\u007fguide']) {
    await assert.rejects(searchHostedPublicWeb(value, options({ beforeSend: async () => { hooks++; return true; }, fetchImpl: async () => { sends++; return response(); } })), failure('not_sent', 'invalid_query'));
    assert.throws(() => hostedTavilyRequestHash(value), failure('not_sent', 'invalid_query'));
  }
  assert.equal(hooks, 0); assert.equal(sends, 0);
});

test('missing keys/hooks, prior abort and nonliteral or throwing hook never send', async () => {
  let sends = 0, hooks = 0;
  const controller = new AbortController(); controller.abort();
  for (const extra of [{ apiKey: '' }, { apiKey: 'bad\nkey' }, { apiKey: 'bad\0key' }, { apiKey: 'bad\ud800key' }, { beforeSend: undefined }, { signal: controller.signal }]) {
    await assert.rejects(searchHostedPublicWeb(query, options({ beforeSend: async () => { hooks++; return true; }, ...extra, fetchImpl: async () => { sends++; return response(); } })), failure('not_sent', 'unavailable'));
  }
  for (const beforeSend of [async () => false, async () => 1, async () => 'true', async () => { throw Error('private-provider-detail'); }]) {
    await assert.rejects(searchHostedPublicWeb(query, options({ beforeSend, fetchImpl: async () => { sends++; return response(); } })), failure('not_sent', 'denied'));
  }
  assert.equal(hooks, 0); assert.equal(sends, 0);
});

test('hosted usage absence is unknown and hosted calls have no cumulative allowance', async () => {
  for (let index = 0; index < 12; index++) {
    const result = await searchHostedPublicWeb(query, options());
    assert.equal(result.requestId, null); assert.deepEqual(result.usage, { credits: null, costNanoUsd: null });
  }
});

test('malformed present metadata rejects after send without retry', async () => {
  for (const extra of [{ request_id: null }, { request_id: '' }, { request_id: 'x'.repeat(201) }, { request_id: 'bad\nrequest' }, { request_id: '\ud800' }, { usage: null }, { usage: [] }, { usage: {} }, { usage: { credits: '1' } }, { usage: { credits: -1 } }, { usage: { credits: 101 } }]) {
    let sends = 0;
    await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => { sends++; return response([item], extra); } })), failure('unknown', 'search_failed'));
    assert.equal(sends, 1);
  }
});

test('hosted response rejects redirects, bad HTTP, UTF8, JSON, counts and exact excerpt bounds', async () => {
  const redirected = response(); Object.defineProperty(redirected, 'redirected', { value: true });
  const bad = [redirected, new Response('{}', { status: 429 }), new Response('{}'), new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }), new Response('{', { headers: { 'content-type': 'application/json' } }), response(Array(4).fill(item)), response([{ ...item, content: 'x'.repeat(6001) }]), response([{ ...item, title: '\ud800' }]), response([{ ...item, content: '\ud800' }]), response([{ ...item, url: 'https://docs.public-site.org/\ud800' }]), response(Array.from({ length: 3 }, (_, i) => ({ ...item, url: `${item.url}/${i}`, content: 'x'.repeat(5500) })))];
  for (const result of bad) await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => result })), failure('unknown', 'search_failed'));
  await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => { throw Error('private-provider-detail'); } })), failure('unknown', 'search_failed'));
});

test('hosted body cap applies to advertised and streamed bytes and cancels bodies', async () => {
  let cancelled = 0;
  const stream = () => new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel() { cancelled++; } });
  await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => new Response(stream(), { headers: { 'content-type': 'application/json' } }) })), failure('unknown', 'search_failed'));
  await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => new Response(stream(), { headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1) } }) })), failure('unknown', 'search_failed'));
  assert.equal(cancelled, 2);
});

test('hosted filtering enforces citation URL and all-public DNS and deduplicates exact sources', async () => {
  for (const url of ['http://docs.public-site.org/', 'https://127.0.0.1/', 'https://docs.public-site.org/?q=secret', 'https://docs.public-site.org/#fragment', 'https://docs.localdomain/', 'https://docs.internal/', 'https://docs.public-site.org:444/', 'https://user@docs.public-site.org/', `https://docs.public-site.org/${'x'.repeat(500)}`]) {
    assert.deepEqual((await searchHostedPublicWeb(query, options({ fetchImpl: async () => response([{ ...item, url }]) }))).sources, []);
  }
  for (const addresses of [[], [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], [{ address: '::1', family: 6 }], [{ address: '2001:db8::1', family: 6 }]]) {
    assert.deepEqual((await searchHostedPublicWeb(query, options({ lookupImpl: async () => addresses }))).sources, []);
  }
  assert.equal((await searchHostedPublicWeb(query, options({ fetchImpl: async () => response([item, { ...item, content: 'Other exact snippet' }]) }))).sources.length, 1);
});

test('abort after grant stays unknown and covers stalled fetch, stream decode and DNS', async () => {
  for (const stage of ['grant', 'fetch', 'decode', 'dns']) {
    const controller = new AbortController(); let sends = 0;
    const opts = options({ signal: controller.signal,
      beforeSend: async () => { if (stage === 'grant') controller.abort(); return true; },
      fetchImpl: async () => {
        sends++;
        if (stage === 'fetch') { controller.abort(); return new Promise(() => {}); }
        if (stage === 'decode') return new Response(new ReadableStream({ pull() { controller.abort(); return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } });
        return response();
      },
      lookupImpl: async () => { controller.abort(); return new Promise(() => {}); },
    });
    await assert.rejects(searchHostedPublicWeb(query, opts), failure('unknown', 'search_failed'));
    assert.equal(sends, stage === 'grant' ? 0 : 1);
  }
});

test('the fixed 20-second deadline remains active through streamed decoding', async t => {
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  let deadlines = 0;
  t.mock.method(AbortSignal, 'timeout', milliseconds => { deadlines++; assert.equal(milliseconds, 20_000); return timeout(15); });
  let cancelled = false;
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(searchHostedPublicWeb(query, options({ fetchImpl: async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }) })), failure('unknown', 'search_failed'));
    assert.equal(deadlines, 1); assert.equal(cancelled, true);
  } finally { clearTimeout(keepAlive); }
});

test('valid zero/maximum credits and maximum exact excerpts are preserved', async () => {
  for (const credits of [0, 100]) {
    const result = await searchHostedPublicWeb(query, options({ fetchImpl: async () => response([{ ...item, content: 'a'.repeat(6000) }, { ...item, url: `${item.url}/two`, content: 'b'.repeat(5000) }, { ...item, url: `${item.url}/three`, content: 'c'.repeat(5000) }], { usage: { credits, ignored: 'metadata' } }) }));
    assert.equal(result.usage.credits, credits); assert.equal(result.sources.reduce((total, source) => total + source.content.length, 0), 16000);
    assert.deepEqual(result.sources.map(source => source.content), ['a'.repeat(6000), 'b'.repeat(5000), 'c'.repeat(5000)]);
  }
});
