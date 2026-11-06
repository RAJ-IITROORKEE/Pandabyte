import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeInspectionClient, NativeInspectionError } from '../src/opencode/inspection-client.ts';
import { createRuntimeInspectionHandler } from '../src/opencode/inspection-handler.ts';

const password = 'fixture-only-'.repeat(4);
const baseUrl = 'http://127.0.0.1:43210';
const safe = { version: '2.2.2', status: 'discovery_only', execution: 'not_execution_ready', counts: { skills: 2, mcpServers: 0, models: 0 }, capabilities: { install: false, configure: false, execute: false } };
const allow = async () => ({ allowed: true });
const request = (suffix = '', options) => new Request('https://local.test/inspection' + suffix, options);
const nativeJSON = (value, init) => Response.json(value, init);
function fixture(override, timeoutMs) {
    const calls = [];
    const transport = async (url, init) => {
        calls.push({ url, init });
        if (override) return override(url, init, calls.length);
        return nativeJSON(url.endsWith('/api/info') ? { version: '2.2.2', pid: 123, cwd: 'PRIVATE_PATH', secret: 'PRIVATE_TOKEN' } : { data: url.endsWith('/api/skill') ? [{ name: 'PRIVATE_NAME', content: 'PRIVATE_INSTRUCTION', path: 'PRIVATE_PATH' }, {}] : [], private: 'PRIVATE_TOKEN' });
    };
    return { calls, client: createNativeInspectionClient({ baseUrl, password, fetch: transport, timeoutMs }) };
}
const unavailable = error => error instanceof NativeInspectionError && error.code === 'unavailable' && error.message === 'unavailable';

test('native read-only inspection calls only verified paths and releases safe discovery counts', async () => {
    const { client, calls } = fixture();
    assert.deepEqual(await client.inspect(), safe);
    assert.deepEqual(calls.map(c => c.url), ['/api/info', '/api/model', '/api/skill', '/api/mcp'].map(p => baseUrl + p));
    for (const { init } of calls) {
        assert.equal(init.method, 'GET');
        assert.equal(init.redirect, 'error');
        assert.equal(init.cache, 'no-store');
        assert.equal(init.credentials, 'omit');
        assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('opencode:' + password).toString('base64'));
        assert.equal(init.body, undefined);
    }
});

test('native model activation barrier settles deny policies before skill discovery', async () => {
    let skillCount = 2;
    const { client } = fixture(async url => {
        if (url.endsWith('/api/info')) return nativeJSON({ version: '2.2.2' });
        if (url.endsWith('/api/model')) {
            // Pinned model.list awaits activation; the final policy removes the two early builtins.
            await Promise.resolve();
            skillCount = 0;
            return nativeJSON({ data: [{}] });
        }
        if (url.endsWith('/api/skill')) return nativeJSON({ data: Array.from({ length: skillCount }, () => ({})) });
        return nativeJSON({ data: [{}, {}] });
    });
    assert.equal(skillCount, 2);
    assert.deepEqual((await client.inspect()).counts, { skills: 0, mcpServers: 2, models: 1 });
});

test('configuration rejects every nonliteral loopback origin and weak credentials before transport', () => {
    for (const value of ['http://localhost:1234', 'http://127.0.0.1', 'https://127.0.0.1:1234', 'http://127.0.0.1:1234/', 'http://127.0.0.1:1234/path', 'http://127.0.0.1:1234?url=x', 'http://127.0.0.1:1234#x', 'http://u:p@127.0.0.1:1234', 'http://127.1:1234', 'http://[::1]:1234', 'http://127.0.0.1:0', 'http://127.0.0.1:65536']) {
        assert.throws(() => createNativeInspectionClient({ baseUrl: value, password }), unavailable);
    }
    for (const value of ['', 'x'.repeat(31), 'x'.repeat(4097)]) assert.throws(() => createNativeInspectionClient({ baseUrl, password: value }), unavailable);
    for (const value of [0, -1, 10001, NaN, 1.5]) assert.throws(() => createNativeInspectionClient({ baseUrl, password, timeoutMs: value }), unavailable);
});

test('version mismatch stops discovery without exposing arbitrary native version values', async () => {
    const { client, calls } = fixture(() => nativeJSON({ version: 'PRIVATE_UNSUPPORTED_VERSION', secret: 'PRIVATE_TOKEN' }));
    await assert.rejects(client.inspect(), error => error instanceof NativeInspectionError && error.code === 'version_mismatch' && error.message === 'version_mismatch');
    assert.equal(calls.length, 1);
});

test('upstream non-200, redirects, MIME, invalid JSON and malformed shapes fail closed', async () => {
    const bad = [
        () => nativeJSON({ secret: 'PRIVATE' }, { status: 401 }),
        () => new Response(null, { status: 302, headers: { location: 'https://external.invalid/' } }),
        () => new Response('{"version":"2.2.2"}', { headers: { 'content-type': 'text/html' } }),
        () => new Response('invalid PRIVATE_PAYLOAD', { headers: { 'content-type': 'application/json' } }),
        () => nativeJSON({ pid: 123 }),
        () => nativeJSON({ data: {} }),
        () => new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }),
        () => { throw Error('PRIVATE_ERROR_AND_TOKEN'); },
    ];
    for (const make of bad) {
        const { client, calls } = fixture(make);
        await assert.rejects(client.inspect(), unavailable);
        assert.equal(calls.length, 1);
    }
    for (const path of ['/api/skill', '/api/mcp', '/api/model']) {
        const { client } = fixture(url => nativeJSON(url.endsWith('/api/info') ? { version: '2.2.2' } : url.endsWith(path) ? { data: {} } : { data: [] }));
        await assert.rejects(client.inspect(), unavailable);
    }
});

test('response limit checks declared bytes and streamed bytes with cancellation', async () => {
    let cancelled = 0;
    for (const declared of [true, false]) {
        const { client } = fixture(() => new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(600_000)); controller.enqueue(new Uint8Array(400_001)); },
            cancel() { cancelled++; },
        }), { headers: { 'content-type': 'application/json', ...(declared ? { 'content-length': '1000001' } : {}) } }));
        await assert.rejects(client.inspect(), unavailable);
    }
    assert.equal(cancelled, 2);
});

test('one total deadline covers pending headers, stalled bodies and all four requests', async () => {
    const headers = fixture(() => new Promise(() => {}), 20);
    await assert.rejects(headers.client.inspect(), unavailable);
    assert.equal(headers.calls.length, 1);
    assert.equal(headers.calls[0].init.signal.aborted, true);
    let cancelled = false;
    const body = fixture(() => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }), 20);
    await assert.rejects(body.client.inspect(), unavailable);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, true);
    const total = fixture(async (url) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return nativeJSON(url.endsWith('/api/info') ? { version: '2.2.2' } : { data: [] });
    }, 35);
    await assert.rejects(total.client.inspect(), unavailable);
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(total.calls.length, 2);
});

test('caller abort stops before dispatch and during body consumption without further requests', async () => {
    const pre = new AbortController(); pre.abort();
    const first = fixture();
    await assert.rejects(first.client.inspect(pre.signal), unavailable);
    assert.equal(first.calls.length, 0);
    const controller = new AbortController();
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    let cancelled = false;
    const current = fixture(() => new Response(new ReadableStream({ pull() { started(); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }));
    const pending = current.client.inspect(controller.signal);
    await ready; controller.abort();
    await assert.rejects(pending, unavailable);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.calls.length, 1);
    assert.equal(current.calls[0].init.signal.aborted, true);
    assert.equal(cancelled, true);
});

test('a late transport response is cancelled after the total deadline without discovery', async () => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let cancelled = false;
    const current = fixture(async () => {
        await held;
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } });
    }, 20);
    await assert.rejects(current.client.inspect(), unavailable);
    release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, true);
    assert.equal(current.calls.length, 1);
});

test('handler denies before upstream dispatch and uses private generic errors', async () => {
    for (const status of [401, 403, 503]) {
        let calls = 0;
        const handler = createRuntimeInspectionHandler(async () => ({ allowed: false, status }), async () => { calls++; return safe; });
        const response = await handler(request());
        assert.equal(response.status, status);
        assert.equal(calls, 0);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    for (const admit of [async () => { throw Error('PRIVATE_TOKEN'); }, async () => null, async () => ({ allowed: false, status: 200 })]) {
        const response = await createRuntimeInspectionHandler(admit, async () => { throw Error('must not call'); })(request());
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
    }
});

test('handler rejects methods, browser parameters and declared bodies without inspection', async () => {
    let calls = 0;
    const handler = createRuntimeInspectionHandler(allow, async () => { calls++; return safe; });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
        const response = await handler(request('', { method }));
        assert.equal(response.status, 405);
        assert.equal(response.headers.get('allow'), 'GET');
    }
    for (const req of [request('?url=http://evil.invalid'), request('?actor=x'), request('?prompt=x'), request('', { headers: { 'content-length': '1' } }), request('', { headers: { 'transfer-encoding': 'chunked' } })]) assert.equal((await handler(req)).status, 400);
    assert.equal(calls, 0);
});

test('handler rechecks admission before releasing counts and strips untrusted extra fields', async () => {
    let admits = 0;
    const revoked = createRuntimeInspectionHandler(async () => ++admits === 1 ? { allowed: true } : { allowed: false, status: 403 }, async () => safe);
    const denied = await revoked(request());
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: { code: 'forbidden' } });
    assert.equal(admits, 2);
    let failedAdmits = 0;
    const failed = await createRuntimeInspectionHandler(async () => ++failedAdmits === 1 ? { allowed: true } : { allowed: false, status: 403 }, async () => { throw new NativeInspectionError('version_mismatch'); })(request());
    assert.equal(failed.status, 403);
    assert.deepEqual(await failed.json(), { error: { code: 'forbidden' } });
    const injected = { ...safe, path: 'PRIVATE_PATH', name: 'PRIVATE_NAME', content: 'PRIVATE_INSTRUCTION', token: 'PRIVATE_TOKEN', counts: { ...safe.counts, actors: 'PRIVATE_CUSTOMER' }, capabilities: { install: true, configure: true, execute: true, raw: 'PRIVATE_PAYLOAD' } };
    const response = await createRuntimeInspectionHandler(allow, async () => injected)(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), safe);
});

test('handler rejects malformed projections and exposes only typed generic failures', async () => {
    for (const result of [null, { ...safe, version: 'PRIVATE_VERSION' }, { ...safe, counts: { ...safe.counts, skills: -1 } }, { ...safe, counts: { ...safe.counts, models: Infinity } }, { ...safe, execution: 'ready' }]) {
        const response = await createRuntimeInspectionHandler(allow, async () => result)(request());
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
    }
    for (const error of [new Error('PRIVATE_ERROR'), new NativeInspectionError('version_mismatch')]) {
        const response = await createRuntimeInspectionHandler(allow, async () => { throw error; })(request());
        assert.deepEqual(await response.json(), { error: { code: error instanceof NativeInspectionError ? 'version_mismatch' : 'unavailable' } });
    }
});

test('caller abort while admission is rechecked prevents successful release', async () => {
    const controller = new AbortController();
    let count = 0;
    const handler = createRuntimeInspectionHandler(async () => { if (++count === 2) controller.abort(); return { allowed: true }; }, async signal => { assert.equal(signal.aborted, false); return safe; });
    const response = await handler(request('', { signal: controller.signal }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
});
