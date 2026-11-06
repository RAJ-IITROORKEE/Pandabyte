import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createNativeRuntimeAdmission } from '../src/server/native-runtime.ts';

const key = '1'.repeat(64);
const initial = () => ({ version: 1, generation: '2'.repeat(64), pid: 1234, baseUrl: 'http://127.0.0.1:43567', directory: resolve('tmp/native-private-fixture'), configHash: '3'.repeat(64), password: 'fixture-private-secret-'.repeat(3) });
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function fixture(options = {}) {
    const state = { descriptor: initial(), reads: 0, calls: [] };
    const admission = createNativeRuntimeAdmission({ key, timeoutMs: options.timeoutMs ?? 100,
        async readDescriptor() { state.reads++; return options.read ? options.read(state) : state.descriptor; },
        async fetch(url, init) { state.calls.push({ url, init }); return options.fetch ? options.fetch(state, url, init) : json({ version: '2.2.2', pid: state.descriptor?.pid }); },
    });
    return { state, admission };
}

test('dispatch is unconditionally off without reading configuration or making a request', async () => {
    const f = fixture();
    assert.equal(await f.admission.authorize('dispatch'), null);
    assert.equal(await f.admission.authorize('anything'), null);
    assert.equal(f.state.reads, 0); assert.equal(f.state.calls.length, 0);
    const connection = await f.admission.connection();
    f.state.reads = 0; f.state.calls.length = 0;
    assert.equal(await connection.authorize('dispatch'), null);
    await assert.rejects(connection.native.create({}, async () => true), { message: 'forbidden' });
    await assert.rejects(connection.native.prompt({}, {}, async () => true), { message: 'forbidden' });
    assert.equal(f.state.reads, 0); assert.equal(f.state.calls.length, 0);
});

test('absent, malformed, extended and unsafe descriptors remain unavailable without network', async () => {
    const bad = [null, [], {}, { ...initial(), enabled: true }, { ...initial(), version: 2 },
        { ...initial(), generation: 'private-generation' }, { ...initial(), configHash: 'x'.repeat(64) },
        ...[0, -1, 1.2, Infinity, '1234'].map(pid => ({ ...initial(), pid })),
        ...['http://localhost:43567', 'http://127.0.0.2:43567', 'https://127.0.0.1:43567', 'http://127.0.0.1:65536', 'http://127.0.0.1:43567/', 'http://127.0.0.1:43567?secret', 'http://user:secret@127.0.0.1:43567'].map(baseUrl => ({ ...initial(), baseUrl })),
        ...['relative', '', resolve('tmp') + '\u0000', resolve('tmp') + '\ud800'].map(directory => ({ ...initial(), directory })),
        ...['short', 'p'.repeat(257), 'p'.repeat(32) + '\n'].map(password => ({ ...initial(), password })),
    ];
    for (const value of bad) {
        const f = fixture(); f.state.descriptor = value;
        assert.equal(await f.admission.authorize('observe'), null);
        assert.equal(await f.admission.connection(), null);
        assert.equal(f.state.calls.length, 0);
    }
});

test('observation uses authenticated fixed loopback GET and releases only an opaque binding', async () => {
    const f = fixture();
    const connection = await f.admission.connection();
    assert.match(connection.binding, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(connection).sort(), ['authorize', 'binding', 'native']);
    assert.equal(await connection.authorize('observe'), connection.binding);
    assert.equal(await f.admission.authorize('observe'), connection.binding);
    for (const { url, init } of f.state.calls) {
        assert.equal(url, f.state.descriptor.baseUrl + '/api/info');
        assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
        assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit'); assert.equal(init.body, undefined);
        assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('opencode:' + f.state.descriptor.password).toString('base64'));
        assert.equal(init.headers['x-opencode-directory'], encodeURIComponent(f.state.descriptor.directory));
    }
    const projection = JSON.stringify(connection);
    for (const secret of [f.state.descriptor.password, f.state.descriptor.directory, f.state.descriptor.baseUrl, f.state.descriptor.generation]) assert.equal(projection.includes(secret), false);
    assert.equal(f.state.reads, f.state.calls.length * 2);
});

test('generation, PID, config, authentication, directory, address and server key separate bindings', async () => {
    const baseline = await fixture().admission.authorize('observe');
    for (const patch of [{ generation: '4'.repeat(64) }, { pid: 2345 }, { configHash: '5'.repeat(64) },
        { password: 'another-private-fixture-secret-'.repeat(2) }, { directory: resolve('tmp/other-private-directory') }, { baseUrl: 'http://127.0.0.1:43568' }]) {
        const f = fixture(); Object.assign(f.state.descriptor, patch);
        const value = await f.admission.authorize('observe');
        assert.match(value, /^[a-f0-9]{64}$/); assert.notEqual(value, baseline);
    }
    const other = createNativeRuntimeAdmission({ key: '6'.repeat(64), readDescriptor: async () => initial(), fetch: async () => json({ version: '2.2.2', pid: 1234 }) });
    assert.notEqual(await other.authorize('observe'), baseline);
});

test('a pinned connection never follows rotated or removed descriptors, including rotation during GET', async () => {
    const f = fixture(); const connection = await f.admission.connection(); f.state.calls.length = 0;
    f.state.descriptor = { ...initial(), generation: '7'.repeat(64) };
    assert.equal(await connection.authorize('observe'), null); assert.equal(f.state.calls.length, 0);
    f.state.descriptor = null;
    assert.equal(await connection.authorize('observe'), null); assert.equal(f.state.calls.length, 0);
    const rotated = fixture({ fetch(state) { state.descriptor = { ...state.descriptor, password: 'rotated-private-password-'.repeat(2) }; return json({ version: '2.2.2', pid: 1234 }); } });
    assert.equal(await rotated.admission.connection(), null); assert.equal(rotated.state.calls.length, 1);
});

test('returned native client retains its original process address and credentials', async () => {
    const f = fixture(); const connection = await f.admission.connection();
    f.state.calls.length = 0;
    f.state.descriptor = { ...initial(), baseUrl: 'http://127.0.0.1:45678', password: 'changed-private-password-'.repeat(2), pid: 9999 };
    await assert.rejects(connection.native.get({ sessionID: 'ses_123456789abcABCDEFGHIJKLMN', title: 'panda-agent-customer-' + 'a'.repeat(32), nonce: 'a'.repeat(32), scope: 'customer', binding: 'b'.repeat(64) }, async () => true));
    assert.equal(f.state.calls.length, 1);
    assert.equal(f.state.calls[0].url, initial().baseUrl + '/api/info');
    assert.equal(f.state.calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('opencode:' + initial().password).toString('base64'));
});

test('PID/version mismatches, HTTP failures and malformed bodies fail closed without retry', async () => {
    const responses = [() => json({ version: '2.2.3', pid: 1234 }), () => json({ version: '2.2.2', pid: 99 }), () => json({ version: '2.2.2', pid: '1234' }),
        () => json(null), () => json([]), () => new Response('{}', { status: 401 }), () => new Response('{}', { status: 302, headers: { location: 'http://external.invalid' } }),
        () => new Response('{}', { headers: { 'content-type': 'text/plain' } }), () => new Response('{broken', { headers: { 'content-type': 'application/json' } }),
        () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
        () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '16385' } }),
        () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': 'invalid' } }),
        () => new Response('x'.repeat(16385), { headers: { 'content-type': 'application/json' } }),
        () => { throw new Error('PRIVATE connection payload'); },
    ];
    for (const response of responses) {
        const f = fixture({ fetch: response });
        assert.equal(await f.admission.authorize('observe'), null); assert.equal(f.state.calls.length, 1);
    }
    const redirect = fixture({ fetch() { const response = json({ version: '2.2.2', pid: 1234 }); Object.defineProperty(response, 'redirected', { value: true }); return response; } });
    assert.equal(await redirect.admission.authorize('observe'), null);
});

test('one deadline bounds descriptor read, ignored-abort fetch and body streams', async () => {
    for (const options of [
        { read: () => new Promise(() => {}) },
        { fetch: () => new Promise(() => {}) },
        { fetch: () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'application/json' } }) },
    ]) {
        const f = fixture({ ...options, timeoutMs: 15 });
        const start = Date.now(); assert.equal(await f.admission.authorize('observe'), null);
        assert.ok(Date.now() - start < 1000); assert.ok(f.state.calls.length <= 1);
        if (f.state.calls.length) assert.equal(f.state.calls[0].init.signal.aborted, true);
    }
});

test('caller cancellation prevents admission and terminates an in-flight read without raw errors', async () => {
    const f = fixture(); const controller = new AbortController(); controller.abort('PRIVATE reason');
    assert.equal(await f.admission.authorize('observe', controller.signal), null); assert.equal(f.state.reads, 0);
    const inFlight = new AbortController();
    const pending = fixture({ fetch() { inFlight.abort('PRIVATE reason'); throw new Error('PRIVATE error'); } });
    assert.equal(await pending.admission.connection(inFlight.signal), null); assert.equal(pending.state.calls.length, 1);
    const readFailure = fixture({ read() { throw new Error('PRIVATE descriptor'); } });
    assert.equal(await readFailure.admission.authorize('observe'), null); assert.equal(readFailure.state.calls.length, 0);
});

test('invalid server configuration throws only a fixed private-boundary error', () => {
    for (const patch of [{ key: 'PRIVATE invalid key' }, { readDescriptor: null }, { timeoutMs: 0 }, { timeoutMs: 10001 }]) {
        assert.throws(() => createNativeRuntimeAdmission({ key, readDescriptor: async () => null, ...patch }), { message: 'unavailable' });
    }
});
