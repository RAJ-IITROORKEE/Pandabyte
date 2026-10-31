import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAnswerHandler } from '../src/server/answer-handler.ts';
const actor = { subject: 'private-subject' };
const endpoint = 'https://localhost:3000/api/panda-agent/answer';
const request = (body = '{"question":"How many pins?"}', options = {}) => new Request(endpoint, {
    method: 'POST', headers: { origin: 'https://localhost:3000', 'content-type': 'application/json', ...options.headers }, body, ...options,
});
const sha = s => createHash('sha256').update(s).digest('hex');
function fixture() {
    const calls = [];
    const handle = `panda:00000000-0000-0000-0000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`;
    const text = 'The listing claims 4 pins.';
    const c = { handle, productId: 'p1', text, textHash: sha(text), header: 'header', physicalRevision: null, blocked: false, title: 'Captured listing', sourceUrl: 'https://pandabyte.in/product-page/board', capturedAt: '2026-10-30T00:00:00Z', sectionPath: ['Specifications'], private_bucket: 'never-return-this' };
    const scope = { fingerprint: 'secret-proof', candidate: true, sealed: true, engineeringVerified: true, manifestVerified: true, configVerified: true, generationCurrent: true, chunks: [c] };
    const adapters = {
        resolveIdentity: async () => { calls.push('identity'); return { kind: 'resolved', product: { id: 'p1', sku: 'SKU1' } }; },
        currentScope: async () => { calls.push('scope'); return structuredClone(scope); },
        lexical: async () => { calls.push('lexical'); return [handle]; },
        dense: async () => { calls.push('dense'); throw Error('unexpected'); },
        select: async () => { calls.push('model'); return { selections: [{ handle, quote: '4 pins' }] }; },
    };
    return { calls, adapters, handle };
}
const assertNoStore = response => assert.match(response.headers.get('cache-control'), /no-store/);
test('signed out and bad method avoid runtime and set no-store', async () => {
    let called = 0;
    const handler = createAnswerHandler(async () => null, async () => { called++; return null; });
    const signedout = await handler(request());
    assert.equal(signedout.status, 401);
    assertNoStore(signedout);
    const method = await handler(new Request(endpoint));
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('allow'), 'POST');
    assertNoStore(method);
    assert.equal(called, 0);
});
test('rejects spoofed input before adapter lookup', async () => {
    let calls = 0;
    const handler = createAnswerHandler(async () => actor, async () => { calls++; return null; });
    for (const field of ['actor', 'model', 'workspace', 'release', 'session', 'backendURL', 'url']) {
        const result = await handler(request(JSON.stringify({ question: 'x', [field]: 'secret' })));
        assert.equal(result.status, 400, field);
        assertNoStore(result);
    }
    assert.equal(calls, 0);
});
test('origin and content-type are enforced before body and runtime', async () => {
    let calls = 0;
    const handler = createAnswerHandler(async () => actor, async () => { calls++; return null; });
    for (const origin of ['https://other.test', 'null', 'https://localhost:3000.evil.test', '']) {
        const r = await handler(request('{}', { headers: { origin, 'content-type': 'application/json' } }));
        assert.equal(r.status, 403);
        assertNoStore(r);
    }
    const missing = await handler(new Request(endpoint, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }));
    assert.equal(missing.status, 403);
    const wrong = await handler(request('{}', { headers: { origin: 'https://localhost:3000', 'content-type': 'text/plain' } }));
    assert.equal(wrong.status, 415);
    assertNoStore(wrong);
    assert.equal(calls, 0);
});
test('stream limit ignores forged content length and cancels overflow', async () => {
    let cancelled = false, calls = 0;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193).fill(65)); }, cancel() { cancelled = true; } });
    const req = new Request(endpoint, { method: 'POST', headers: { origin: 'https://localhost:3000', 'content-type': 'application/json', 'content-length': '1' }, body: stream, duplex: 'half' });
    const handler = createAnswerHandler(async () => actor, async () => { calls++; return null; });
    const r = await handler(req);
    assert.equal(r.status, 413);
    assertNoStore(r);
    assert.equal(cancelled, true);
    assert.equal(calls, 0);
});
test('malformed JSON and invalid UTF-8 fail before adapter lookup', async () => {
    let calls = 0;
    const handler = createAnswerHandler(async () => actor, async () => { calls++; return null; });
    for (const body of ['{', new Uint8Array([0x7b, 0xff, 0x7d])]) {
        const r = await handler(request(body));
        assert.equal(r.status, 400);
        assertNoStore(r);
    }
    assert.equal(calls, 0);
});
test('missing runtime is honest and no retry or disclosure occurs', async () => {
    let calls = 0;
    const handler = createAnswerHandler(async () => actor, async () => { calls++; return null; });
    const r = await handler(request());
    const data = await r.json();
    assert.equal(r.status, 503);
    assert.equal(calls, 1);
    assert.equal(data.outcome, 'unavailable');
    assert.equal(data.capabilities.documentationAnswers, false);
    assert.deepEqual(data.citations, []);
    assert.ok(!JSON.stringify(data).includes(actor.subject));
    assertNoStore(r);
    const defaultHandler = createAnswerHandler(async () => actor);
    assert.equal((await defaultHandler(request())).status, 503);
});
test('successful mocked flow returns extractive citation and no internal fields', async () => {
    const x = fixture();
    let received;
    const handler = createAnswerHandler(async () => actor, async (a) => { received = a; return x.adapters; });
    const r = await handler(request());
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(received, actor);
    assert.equal(data.outcome, 'evidence');
    assert.equal(data.text, 'The captured listing states: “4 pins” [S1]');
    assert.deepEqual(data.citations, [{ id: 'S1', title: 'Captured listing', sourceUrl: 'https://pandabyte.in/product-page/board', capturedAt: '2026-10-30T00:00:00Z', quote: '4 pins', sectionPath: ['Specifications'] }]);
    assert.deepEqual(data.capabilities, { documentationAnswers: true, codeSuggestions: false, compile: false, flash: false, serial: false });
    for (const privateValue of [actor.subject, x.handle, 'secret-proof', 'never-return-this'])
        assert.ok(!JSON.stringify(data).includes(privateValue));
    assertNoStore(r);
    assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
});
test('auth and dependency callback errors are generic and never retried', async () => {
    let authCalls = 0;
    const authFail = createAnswerHandler(async () => { authCalls++; throw Error('secret-auth'); });
    const a = await authFail(request());
    assert.equal(a.status, 503);
    assert.equal(authCalls, 1);
    assert.ok(!(await a.text()).includes('secret-auth'));
    let depsCalls = 0;
    const depFail = createAnswerHandler(async () => actor, async () => { depsCalls++; throw Error('secret-dependency'); });
    const b = await depFail(request());
    assert.equal(b.status, 503);
    assert.equal(depsCalls, 1);
    assert.ok(!(await b.text()).includes('secret-dependency'));
    assertNoStore(a);
    assertNoStore(b);
});
test('domain clarification and model failure map without exposing errors', async () => {
    const x = fixture();
    x.adapters.resolveIdentity = async () => ({ kind: 'clarification' });
    const h = createAnswerHandler(async () => actor, async () => x.adapters);
    const a = await h(request());
    assert.equal(a.status, 200);
    assert.equal((await a.json()).outcome, 'clarification');
    const y = fixture();
    y.adapters.select = async () => { throw Error('secret-model'); };
    const h2 = createAnswerHandler(async () => actor, async () => y.adapters);
    const b = await h2(request());
    assert.equal(b.status, 503);
    assert.ok(!(await b.text()).includes('secret-model'));
});
