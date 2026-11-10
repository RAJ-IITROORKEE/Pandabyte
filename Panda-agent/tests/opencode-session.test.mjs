import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSessionClient } from '../src/opencode/session-client.ts';
import { createNativeReceipt, createNativeMessageID, NativeSessionError } from '../src/opencode/session-contracts.ts';

const baseUrl = 'http://127.0.0.1:43210';
const password = 'fixture-only-password-'.repeat(3);
const directory = process.platform === 'win32' ? 'C:/fixture/opencode' : '/fixture/opencode';
const binding = 'a'.repeat(64);
const allow = async () => true;
const unavailable = error => error instanceof NativeSessionError && error.code === 'unavailable' && error.message === 'unavailable';
const unknown = error => error instanceof NativeSessionError && error.outcome === 'unknown';
function fixture(options = {}) {
    const receipt = createNativeReceipt('customer', binding);
    const state = {
        id: receipt.sessionID, title: receipt.title,
        metadata: { pandaAgent: { nonce: receipt.nonce, scope: receipt.scope, binding: receipt.binding } },
        location: { directory }, projectID: 'prj_fixture', cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 100, updated: 100 },
    };
    const calls = [];
    const native = { active: false, messages: [], interrupted: true, removed: false, children: [] };
    const defaultResponse = (url, init) => {
        const path = new URL(url).pathname;
        if (path === '/api/info') return Response.json({ version: options.actualVersion ?? '2.2.2', pid: 321 });
        if (path === '/api/model') return Response.json({ data: [] });
        if (path === '/api/session' && init.method === 'POST') return Response.json({ data: state });
        if (path === '/api/session' && init.method === 'GET') return Response.json({ data: native.children, cursor: { previous: null, next: null } });
        if (path === '/api/session/active') return Response.json({ data: native.active ? { [receipt.sessionID]: { type: 'running' } } : {} });
        if (path === `/api/session/${receipt.sessionID}`) {
            if (init.method === 'DELETE') { native.removed = true; return new Response(null, { status: 204 }); }
            return native.removed ? Response.json({ _tag: 'SessionNotFoundError', sessionID: receipt.sessionID, message: 'Fixture absent' }, { status: 404 }) : Response.json({ data: state });
        }
        if (path.endsWith('/message')) return Response.json({ data: native.messages, cursor: { previous: null, next: null } });
        if (path.endsWith('/prompt')) {
            const body = JSON.parse(init.body);
            native.active = true;
            state.time = { ...state.time, updated: 200, busy: 200 };
            return Response.json({ data: { type: 'user', id: body.id, sessionID: receipt.sessionID, time: { created: 200 }, delivery: 'steer', payload: { text: body.text } } });
        }
        if (path.endsWith('/interrupt')) {
            if (native.interrupted) {
                native.active = false;
                state.outcome = 'interrupted';
                state.time = { ...state.time, updated: 300, busy: 200, idle: 300 };
            }
            return Response.json({ interrupted: native.interrupted });
        }
        throw Error('Unexpected fixture request');
    };
    const client = createNativeSessionClient({ baseUrl, password, directory, expectedPid: 321, expectedVersion: options.expectedVersion, timeoutMs: options.timeoutMs,
        fetch: async (url, init) => {
            calls.push({ url, init });
            return options.fetch ? options.fetch(url, init, { state, native, calls, defaultResponse, receipt }) : defaultResponse(url, init);
        },
    });
    return { client, receipt, state, native, calls };
}

test('native receipt and message IDs use the 2.2.2 wire format without customer identity', () => {
    const receipts = Array.from({ length: 100 }, () => createNativeReceipt('playground', binding));
    assert.equal(new Set(receipts.map(value => value.sessionID)).size, 100);
    for (const receipt of receipts) {
        assert.match(receipt.sessionID, /^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/);
        assert.match(createNativeMessageID(), /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/);
        assert.equal(receipt.title, `panda-agent-playground-${receipt.nonce}`);
        assert.equal(Object.isFrozen(receipt), true);
    }
    for (const value of ['', 'owner@example.test', 'user_private', 'a'.repeat(63)]) assert.throws(() => createNativeReceipt('customer', value), unavailable);
    assert.throws(() => createNativeReceipt('admin', binding), unavailable);
});

test('server configuration rejects nonliteral loopback, weak secrets and relative or unsafe directory', () => {
    const config = { baseUrl, password, directory, expectedPid: 321 };
    for (const url of ['http://localhost:1234', 'https://127.0.0.1:1234', baseUrl + '/', baseUrl + '/x', baseUrl + '?x=1', 'http://127.1:1234', 'http://user:secret@127.0.0.1:1234', 'http://127.0.0.1:65536', 'http://127.0.0.1:0']) assert.throws(() => createNativeSessionClient({ ...config, baseUrl: url }), unavailable);
    for (const secret of ['', 'x'.repeat(31), 'x'.repeat(4097)]) assert.throws(() => createNativeSessionClient({ ...config, password: secret }), unavailable);
    for (const location of ['', 'relative', directory + '\nsecret', directory + '\0']) assert.throws(() => createNativeSessionClient({ ...config, directory: location }), unavailable);
    for (const timeoutMs of [0, -1, 10001, NaN, 1.5]) assert.throws(() => createNativeSessionClient({ ...config, timeoutMs }), unavailable);
    for (const expectedPid of [undefined, 0, -1, NaN, 1.5]) assert.throws(() => createNativeSessionClient({ ...config, expectedPid }), unavailable);
});

test('create uses persisted identity, activation barrier, exact ownership metadata and deny permissions', async () => {
    const current = fixture();
    let checks = 0;
    const result = await current.client.create(current.receipt, async value => { checks++; assert.deepEqual(value, current.receipt); return true; });
    assert.deepEqual(result, { time: { created: 100, updated: 100 } });
    assert.deepEqual(current.calls.map(call => new URL(call.url).pathname), ['/api/info', '/api/model', '/api/session', `/api/session/${current.receipt.sessionID}`, '/api/info']);
    assert.equal(checks, 3);
    const body = JSON.parse(current.calls[2].init.body);
    assert.deepEqual(body, { id: current.receipt.sessionID, title: current.receipt.title, location: { directory }, metadata: { pandaAgent: { nonce: current.receipt.nonce, scope: 'customer', binding } }, permissions: [{ action: '*', resource: '*', effect: 'deny' }] });
    for (const { init } of current.calls) {
        assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit');
        assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('opencode:' + password).toString('base64'));
        assert.equal(init.headers['x-opencode-directory'], encodeURIComponent(directory));
    }
});

test('durable access callback denies forged owner bindings and cross-scope receipts before transport', async () => {
    const current = fixture();
    const check = async receipt => JSON.stringify(receipt) === JSON.stringify(current.receipt);
    for (const forged of [{ ...current.receipt, binding: 'b'.repeat(64) }, { ...current.receipt, scope: 'playground', title: `panda-agent-playground-${current.receipt.nonce}` }, { ...current.receipt, sessionID: createNativeReceipt('customer', binding).sessionID }]) {
        await assert.rejects(current.client.get(forged, check), error => error.code === 'forbidden' && error.outcome === 'not_dispatched');
    }
    assert.equal(current.calls.length, 0);
    for (const forged of [{ ...current.receipt, extra: 'x' }, { ...current.receipt, sessionID: '../../private' }, { ...current.receipt, title: 'wrong' }, { ...current.receipt, nonce: 'x' }]) await assert.rejects(current.client.get(forged, allow), unavailable);
    assert.equal(current.calls.length, 0);
});

test('native ownership checks reject cross-directory, fork, scope, title and nonce responses', async () => {
    for (const mutate of [
        state => { state.title = 'foreign'; }, state => { state.id = createNativeReceipt('customer', binding).sessionID; },
        state => { state.metadata.pandaAgent.nonce = 'b'.repeat(32); }, state => { state.metadata.pandaAgent.binding = 'b'.repeat(64); },
        state => { state.metadata.pandaAgent.scope = 'playground'; }, state => { state.metadata.pandaAgent.extra = 'x'; },
        state => { state.location.directory = directory + '/other'; }, state => { state.parentID = state.id; }, state => { state.fork = {}; },
        state => { state.time.busy = '200'; }, state => { state.outcome = 'unknown'; },
    ]) {
        const current = fixture(); mutate(current.state);
        await assert.rejects(current.client.get(current.receipt, allow), unavailable);
    }
});

test('version and malformed response errors are generic and prevent mutation', async () => {
    const errors = [
        () => Response.json({ version: 'PRIVATE_VERSION' }),
        () => Response.json({ secret: 'PRIVATE_SECRET' }, { status: 401 }),
        () => new Response(null, { status: 302, headers: { location: 'https://private.invalid' } }),
        () => new Response('{"version":"2.2.2"}', { headers: { 'content-type': 'text/html' } }),
        () => new Response('PRIVATE_BROKEN_JSON', { headers: { 'content-type': 'application/json' } }),
        () => new Response(new Uint8Array([255]), { headers: { 'content-type': 'application/json' } }),
        () => { throw Error('PRIVATE_NATIVE_ERROR'); },
    ];
    for (const fetch of errors) {
        const current = fixture({ fetch });
        await assert.rejects(current.client.create(current.receipt, allow), error => error instanceof NativeSessionError && ['version_mismatch', 'unavailable'].includes(error.code) && error.outcome === 'not_dispatched' && !error.message.includes('PRIVATE'));
        assert.equal(current.calls.length, 1);
    }
});

test('response bytes are bounded by declared and streamed lengths and bodies are cancelled', async () => {
    let cancelled = 0;
    for (const declared of [true, false]) {
        const current = fixture({ fetch: () => new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(600_000)); controller.enqueue(new Uint8Array(400_001)); },
            cancel() { cancelled++; },
        }), { headers: { 'content-type': 'application/json', ...(declared ? { 'content-length': '1000001' } : {}) } }) });
        await assert.rejects(current.client.get(current.receipt, allow), unavailable);
    }
    assert.equal(cancelled, 2);
});

test('prompt is a single native inbox acknowledgement, never terminal output', async () => {
    const current = fixture();
    current.state.outcome = 'succeeded'; current.state.time = { ...current.state.time, busy: 110, idle: 120 };
    const input = { messageID: createNativeMessageID(), text: 'Fixture question' };
    assert.deepEqual(await current.client.prompt(current.receipt, input, allow), { status: 'accepted', messageID: input.messageID });
    assert.equal(current.state.outcome, 'succeeded');
    assert.equal(current.state.time.idle < current.state.time.busy, true);
    const posts = current.calls.filter(call => call.init.method === 'POST');
    assert.equal(posts.length, 1);
    assert.deepEqual(JSON.parse(posts[0].init.body), { id: input.messageID, text: input.text });
    assert.equal(current.calls.some(call => call.url.includes('/message?')), false);
});

test('prompt bounds and busy state reject before mutation and malformed acknowledgement stays unknown', async () => {
    const current = fixture();
    for (const input of [{ messageID: createNativeMessageID(), text: '' }, { messageID: '../../x', text: 'x' }, { messageID: createNativeMessageID(), text: 'x'.repeat(98305) }, { messageID: createNativeMessageID(), text: 'x', model: 'not-authority' }]) assert.throws(() => current.client.prompt(current.receipt, input, allow), unavailable);
    assert.equal(current.calls.length, 0);
    current.native.active = true;
    await assert.rejects(current.client.prompt(current.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow), error => unavailable(error) && error.outcome === 'not_dispatched');
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 0);
    for (const ack of [{ data: { type: 'assistant', text: 'ANSWER' } }, { data: { type: 'user', sessionID: 'foreign' } }, { data: { type: 'user', sessionID: current.receipt.sessionID, id: createNativeMessageID() } }]) {
        const broken = fixture({ fetch: (url, init, f) => url.endsWith('/prompt') ? Response.json(ack) : f.defaultResponse(url, init) });
        await assert.rejects(broken.client.prompt(broken.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow), unknown);
        assert.equal(broken.calls.filter(call => call.init.method === 'POST').length, 1);
    }
});

test('unknown dispatch outcome has no automatic retry or global runner state', async () => {
    const current = fixture({ timeoutMs: 20, fetch: (url, init, f) => url.endsWith('/prompt') ? new Promise(() => {}) : f.defaultResponse(url, init) });
    await assert.rejects(current.client.prompt(current.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow), unknown);
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 1);
    assert.equal(current.calls.at(-1).init.signal.aborted, true);
    // Reconciliation is read-only; the durable caller alone decides whether any future dispatch is admitted.
    assert.deepEqual(await current.client.get(current.receipt, allow), { time: { created: 100, updated: 100 } });
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 1);
});

test('deadline includes stalled headers, body consumption and authorization; late bodies are cancelled', async () => {
    const headers = fixture({ timeoutMs: 20, fetch: () => new Promise(() => {}) });
    await assert.rejects(headers.client.get(headers.receipt, allow), unavailable);
    let cancelled = 0;
    const body = fixture({ timeoutMs: 20, fetch: () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'content-type': 'application/json' } }) });
    await assert.rejects(body.client.get(body.receipt, allow), unavailable);
    const access = fixture({ timeoutMs: 20 });
    await assert.rejects(access.client.get(access.receipt, () => new Promise(() => {})), unavailable);
    assert.equal(access.calls.length, 0);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const late = fixture({ timeoutMs: 20, fetch: async () => { await held; return new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'content-type': 'application/json' } }); } });
    await assert.rejects(late.client.get(late.receipt, allow), unavailable);
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, 2);
});

test('revoked access suppresses read release and records uncertainty after native mutation', async () => {
    const current = fixture();
    let checks = 0;
    await assert.rejects(current.client.get(current.receipt, async () => ++checks === 1), error => error.code === 'forbidden' && error.outcome === 'not_dispatched');
    let admitted = true;
    const prompt = fixture({ fetch: (url, init, f) => { const response = f.defaultResponse(url, init); if (url.endsWith('/prompt')) admitted = false; return response; } });
    await assert.rejects(prompt.client.prompt(prompt.receipt, { messageID: createNativeMessageID(), text: 'x' }, async () => admitted), error => error.code === 'forbidden' && error.outcome === 'unknown');
    assert.equal(prompt.calls.filter(call => call.init.method === 'POST').length, 1);
    let mutationChecks = 0;
    const denied = fixture();
    await assert.rejects(denied.client.create(denied.receipt, async () => ++mutationChecks === 1), error => error.code === 'forbidden' && error.outcome === 'not_dispatched');
    assert.equal(denied.calls.filter(call => call.init.method === 'POST').length, 0);
});

test('caller abort prevents dispatch and abort after native prompt acknowledgement remains unknown', async () => {
    const pre = new AbortController(); pre.abort();
    const first = fixture();
    await assert.rejects(first.client.create(first.receipt, allow, pre.signal), unavailable);
    assert.equal(first.calls.length, 0);
    const controller = new AbortController();
    const current = fixture({ fetch: (url, init, f) => { const response = f.defaultResponse(url, init); if (url.endsWith('/prompt')) controller.abort(); return response; } });
    await assert.rejects(current.client.prompt(current.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow, controller.signal), unknown);
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 1);
});

test('message history projects actual user/assistant/idle shapes and drops reasoning, errors and tool payloads', async () => {
    const current = fixture();
    current.native.messages = [
        { id: createNativeMessageID(), type: 'user', text: 'Question', time: { created: 100 }, metadata: { private: 'PRIVATE' } },
        { id: createNativeMessageID(), type: 'assistant', agent: 'fixture', model: { id: 'fixture', providerID: 'fixture' }, time: { created: 200, completed: 250 }, content: [{ type: 'reasoning', text: 'PRIVATE_REASONING' }, { type: 'text', text: 'Answer' }, { type: 'tool', name: 'PRIVATE_TOOL', state: { input: 'PRIVATE_INPUT' } }], error: { message: 'PRIVATE_ERROR' }, retry: { error: 'PRIVATE_RETRY' }, native: { private: 'PRIVATE_NATIVE' } },
        { id: createNativeMessageID(), type: 'skill', skill: 'PRIVATE_SKILL', name: 'PRIVATE_NAME', text: 'PRIVATE_INSTRUCTIONS', time: { created: 260 } },
        { id: createNativeMessageID(), type: 'idle', outcome: 'failed', time: { created: 300 } },
    ];
    const result = await current.client.messages(current.receipt, allow);
    assert.deepEqual(result.map(item => item.type), ['user', 'assistant', 'activity', 'idle']);
    assert.equal(result[1].text, 'Answer'); assert.equal(result[1].failed, true); assert.equal(result[1].retrying, true);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(current.calls.filter(call => call.url.endsWith(`/api/session/${current.receipt.sessionID}`)).length, 2);
});

test('history pagination uses only native opaque cursors and rejects duplicates, overflow and malformed content', async () => {
    let pages = 0;
    const current = fixture({ fetch: (url, init, f) => {
        if (!url.includes('/message?')) return f.defaultResponse(url, init);
        return Response.json({ data: [{ id: createNativeMessageID(), type: 'user', text: 'x', time: { created: 100 + pages } }], cursor: ++pages === 1 ? { next: 'cGFnZQ' } : { previous: 'cHJldg' } });
    } });
    assert.equal((await current.client.messages(current.receipt, allow)).length, 2);
    assert.match(current.calls.find(call => call.url.includes('cursor=')).url, /limit=100&cursor=cGFnZQ$/);
    const id = createNativeMessageID();
    for (const data of [
        { data: [], cursor: { next: 'https://private.invalid/' } },
        { data: [], cursor: { next: 'cGFnZQ' } },
        { data: [], cursor: { unexpected: null } },
        { data: [], cursor: { next: 1 } },
        { data: Array.from({ length: 101 }, () => ({ id, type: 'user', text: 'x', time: { created: 100 } })), cursor: {} },
        { data: [{ id, type: 'user', text: 'x', time: { created: 100 } }, { id, type: 'user', text: 'x', time: { created: 100 } }], cursor: {} },
        { data: [{ id, type: 'assistant', content: [{ type: 'unrecognized', text: 'x' }], time: { created: 100 } }], cursor: {} },
    ]) {
        const broken = fixture({ fetch: (url, init, f) => url.includes('/message?') ? Response.json(data) : f.defaultResponse(url, init) });
        await assert.rejects(broken.client.messages(broken.receipt, allow), unavailable);
    }
});

test('observed native 2.2.2 null terminal cursors end empty and populated history without another page', async () => {
    for (const cursor of [{ previous: null, next: null }, { previous: null }, { next: null }, {}]) {
        for (const populated of [false, true]) {
            const data = populated ? [{ id: createNativeMessageID(), type: 'user', text: 'Fixture', time: { created: 100 } }] : [];
            const current = fixture({ fetch: (url, init, f) => url.includes('/message?') ? Response.json({ data, cursor }) : f.defaultResponse(url, init) });
            const result = await current.client.messages(current.receipt, allow);
            assert.equal(result.length, data.length);
            assert.equal(current.calls.filter(call => call.url.includes('/message?')).length, 1);
        }
    }
});

test('interrupt confirms cancellation only from actual native interruption, new terminal time and inactive drain', async () => {
    const current = fixture();
    current.native.active = true;
    current.state.outcome = 'succeeded'; current.state.time = { ...current.state.time, busy: 200, idle: 150 };
    assert.deepEqual(await current.client.interrupt(current.receipt, allow), { status: 'cancelled', outcome: 'interrupted' });
    assert.match(current.calls.find(call => call.init.method === 'POST').url, /\/interrupt\?resume=false$/);
    assert.equal(current.calls.find(call => call.init.method === 'POST').init.body, undefined);
    const terminal = fixture();
    terminal.state.outcome = 'succeeded'; terminal.state.time = { ...terminal.state.time, busy: 200, idle: 300 };
    assert.deepEqual(await terminal.client.interrupt(terminal.receipt, allow), { status: 'already_terminal', outcome: 'succeeded' });
    assert.equal(terminal.calls.some(call => call.init.method === 'POST'), false);
    for (const variant of ['ack_only', 'still_active', 'no_new_idle', 'no_terminal', 'old_outcome']) {
        const uncertain = fixture({ fetch: (url, init, f) => {
            if (!url.includes('/interrupt?')) return f.defaultResponse(url, init);
            if (variant !== 'still_active') f.native.active = false;
            if (variant !== 'no_terminal') {
                f.state.outcome = variant === 'old_outcome' ? 'succeeded' : 'interrupted';
                f.state.time.idle = variant === 'no_new_idle' ? 150 : 300;
            }
            return Response.json({ interrupted: variant !== 'ack_only' });
        } });
        uncertain.native.active = true;
        uncertain.state.time = { ...uncertain.state.time, busy: 200, idle: 150 };
        assert.deepEqual(await uncertain.client.interrupt(uncertain.receipt, allow), { status: 'unknown' });
    }
});

test('unknown create and changed native ownership after acknowledgement retain durable reconciliation identity', async () => {
    const create = fixture({ timeoutMs: 20, fetch: (url, init, f) => new URL(url).pathname === '/api/session' ? new Promise(() => {}) : f.defaultResponse(url, init) });
    await assert.rejects(create.client.create(create.receipt, allow), unknown);
    const post = create.calls.find(call => call.init.method === 'POST');
    assert.equal(JSON.parse(post.init.body).id, create.receipt.sessionID);
    assert.equal(create.calls.filter(call => call.init.method === 'POST').length, 1);
    const prompt = fixture({ fetch: (url, init, f) => {
        const result = f.defaultResponse(url, init);
        if (url.endsWith('/prompt')) f.state.metadata.pandaAgent.scope = 'playground';
        return result;
    } });
    await assert.rejects(prompt.client.prompt(prompt.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow), unknown);
    assert.equal(prompt.calls.filter(call => call.init.method === 'POST').length, 1);
});

test('history bounds reject cursor cycles and a fifth page without returning partial history', async () => {
    for (const cycle of [true, false]) {
        let page = 0;
        const current = fixture({ fetch: (url, init, f) => {
            if (!url.includes('/message?')) return f.defaultResponse(url, init);
            page++;
            return Response.json({ data: [{ id: createNativeMessageID(), type: 'user', text: 'x', time: { created: 100 + page } }], cursor: { next: cycle ? 'Y3ljbGU' : `cGFnZQ${page}` } });
        } });
        await assert.rejects(current.client.messages(current.receipt, allow), unavailable);
        assert.equal(page, cycle ? 2 : 4);
    }
});

test('active list releases only owned boolean and rejects malformed active states', async () => {
    const current = fixture();
    current.native.active = true;
    assert.deepEqual(await current.client.active(current.receipt, allow), { active: true });
    for (const data of [{ invalid: { type: 'running' } }, { [current.receipt.sessionID]: { type: 'idle' } }]) {
        const broken = fixture({ fetch: (url, init, f) => url.endsWith('/api/session/active') ? Response.json({ data }) : f.defaultResponse(url, init) });
        await assert.rejects(broken.client.active(broken.receipt, allow), unavailable);
    }
});

test('server-owned native location header prevents default-location false inactivity and cancellation', async () => {
    const current = fixture({ fetch: (url, init, f) => {
        if (url.endsWith('/api/session/active') && init.headers['x-opencode-directory'] !== encodeURIComponent(directory)) return Response.json({ data: {} });
        return f.defaultResponse(url, init);
    } });
    current.native.active = true;
    assert.deepEqual(await current.client.active(current.receipt, allow), { active: true });
    await assert.rejects(current.client.prompt(current.receipt, { messageID: createNativeMessageID(), text: 'x' }, allow), unavailable);
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 0);
    current.state.outcome = 'interrupted';
    current.state.time = { ...current.state.time, busy: 110, idle: 150 };
    assert.deepEqual(await current.client.interrupt(current.receipt, allow), { status: 'cancelled', outcome: 'interrupted' });
    assert.equal(current.calls.filter(call => call.init.method === 'POST').length, 1);
    assert.equal(current.calls.every(call => call.init.headers['x-opencode-directory'] === encodeURIComponent(directory)), true);
});

test('owned inactive native removal refuses cascade and verifies exact absent identity on the pinned process', async () => {
    const current = fixture();
    // Caller admission represents the durable terminal/no-future-prompt cleanup fence.
    assert.deepEqual(await current.client.remove(current.receipt, allow), { status: 'removed' });
    const removed = current.calls.filter(call => call.init.method === 'DELETE');
    assert.equal(removed.length, 1);
    const children = new URL(current.calls.find(call => call.url.includes('parentID=')).url);
    assert.equal(children.searchParams.get('parentID'), current.receipt.sessionID);
    assert.equal(children.searchParams.get('limit'), '1');
    assert.deepEqual(await current.client.absence(current.receipt, allow), { absent: true });
    assert.equal(current.calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('active work, incomplete busy state, child sessions and lost admission prevent native removal', async () => {
    for (const prepare of [
        f => { f.native.active = true; },
        f => { f.state.time.busy = 110; },
        f => { f.native.children = [{ id: 'unrelated-child' }]; },
        f => { f.state.metadata.pandaAgent.binding = 'b'.repeat(64); },
    ]) {
        const current = fixture(); prepare(current);
        await assert.rejects(current.client.remove(current.receipt, allow), unavailable);
        assert.equal(current.calls.some(call => call.init.method === 'DELETE'), false);
    }
    const current = fixture(); let checks = 0;
    await assert.rejects(current.client.remove(current.receipt, async () => ++checks < 2), error => error.code === 'forbidden' && error.outcome === 'not_dispatched');
    assert.equal(current.calls.some(call => call.init.method === 'DELETE'), false);
});

test('pinned process mismatch before a call or before release never supplies cleanup proof', async () => {
    const wrong = fixture({ fetch: (url, init, f) => url.endsWith('/api/info') ? Response.json({ version: '2.2.2', pid: 999 }) : f.defaultResponse(url, init) });
    await assert.rejects(wrong.client.remove(wrong.receipt, allow), unavailable);
    await assert.rejects(wrong.client.absence(wrong.receipt, allow), unavailable);
    assert.equal(wrong.calls.some(call => call.init.method === 'DELETE'), false);
    let infos = 0;
    const changed = fixture({ fetch: (url, init, f) => url.endsWith('/api/info') ? Response.json({ version: '2.2.2', pid: ++infos === 1 ? 321 : 999 }) : f.defaultResponse(url, init) });
    await assert.rejects(changed.client.remove(changed.receipt, allow), unknown);
    assert.equal(changed.calls.filter(call => call.init.method === 'DELETE').length, 1);
});

test('uncertain native deletion is never repeated and observation can reconcile only exact absence', async () => {
    const current = fixture({ fetch: (url, init, f) => {
        if (init.method === 'DELETE') { f.native.removed = true; throw Error('lost ack'); }
        return f.defaultResponse(url, init);
    } });
    await assert.rejects(current.client.remove(current.receipt, allow), unknown);
    assert.deepEqual(await current.client.absence(current.receipt, allow), { absent: true });
    assert.equal(current.calls.filter(call => call.init.method === 'DELETE').length, 1);
    for (const response of [
        () => Response.json({ _tag: 'OtherError', sessionID: current.receipt.sessionID, message: 'wrong' }, { status: 404 }),
        () => Response.json({ _tag: 'SessionNotFoundError', sessionID: 'wrong-session', message: 'wrong' }, { status: 404 }),
        () => new Response('not found', { status: 404 }),
    ]) {
        const broken = fixture({ fetch: (url, init, f) => url.includes('/api/session/') && !url.endsWith('/active') ? response() : f.defaultResponse(url, init) });
        await assert.rejects(broken.client.absence(broken.receipt, allow), unavailable);
        assert.equal(broken.calls.some(call => call.init.method === 'DELETE'), false);
    }
});

test('removal acknowledgement without verified absence remains unknown', async () => {
    const current = fixture({ fetch: (url, init, f) => init.method === 'DELETE' ? new Response(null, { status: 204 }) : f.defaultResponse(url, init) });
    await assert.rejects(current.client.remove(current.receipt, allow), unknown);
    assert.equal(current.calls.filter(call => call.init.method === 'DELETE').length, 1);
});


test('selected native version is explicit and mismatches fail before mutation', async () => {
    const ok = fixture({ expectedVersion: '2.2.6', actualVersion: '2.2.6' });
    await ok.client.create(ok.receipt, allow);
    const foreign = fixture({ expectedVersion: '2.2.6' });
    await assert.rejects(foreign.client.create(foreign.receipt, allow), error => error.code === 'version_mismatch' && error.outcome === 'not_dispatched');
    assert.equal(foreign.calls.some(call => call.init.method === 'POST'), false);
    assert.throws(() => fixture({ expectedVersion: '2.2.7' }), unavailable);
});
