import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createNativeTurn } from '../src/server/native-turn.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';
import { createNativeMessageID, NativeSessionError } from '../src/opencode/session-contracts.ts';
import { prepareEvidenceContext } from '../src/retrieval/prepared-evidence.ts';

const input = { thread: '11111111-1111-4111-8111-111111111111', request: '22222222-2222-4222-8222-222222222222', question: 'Hello, help me understand embedded development.' };
const sha = value => createHash('sha256').update(value).digest('hex');
const output = { outcome: 'conversation', text: 'Embedded systems combine software with dedicated hardware.', selections: [] };
const unavailableText = 'This request ended without a current validated result. No uncertain request was repeated. Start a new question.';
const cancelledText = 'This request was cancelled. Start a new question when ready.';
const product = { id: 'aaaaaaaa-1111-4111-8111-111111111111', sku: 'FIXTURE' };
const text = 'Fixture listing states 4 pins.';
const chunk = { handle: `panda:00000000-0000-0000-0000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`, productId: product.id, text, textHash: sha(text), header: 'canonical header', physicalRevision: null, blocked: false, title: 'Fixture listing', sourceUrl: 'https://pandabyte.in/product-page/fixture', capturedAt: '2026-11-06T00:00:00Z', sectionPath: ['Specifications'] };

function fixture(options = {}) {
    const calls = [], state = { current: true, runtime: 'a'.repeat(64), dispatchAllowed: true, binding: 'b'.repeat(64), run: null, prompt: null, complete: null, busy: false, outcome: 'succeeded', raw: JSON.stringify(output), withdrawn: false, scopeHash: 'c'.repeat(64) };
    const hooks = {};
    const conflict = () => { throw new ChatStoreError('conflict'); };
    const snapshot = () => structuredClone(state.run);
    const store = {
        async state() { calls.push('state'); await hooks.state?.(); return snapshot(); },
        async admit(value) {
            calls.push('admit'); await hooks.admit?.();
            if (state.run) return conflict();
            state.run = { receipt: value.receipt, messageID: value.messageID, promptHash: value.promptHash, runtimeBinding: value.runtimeBinding, scopes: value.scopes, phase: 'admitted', version: 1, createClaimed: false, promptClaimed: false, cancelRequested: false, terminalReason: null, nativeOutcome: null, responseHash: null, removalClaimed: false, runtimeRetired: false };
            return { admitted: true, state: snapshot() };
        },
        async transition(_thread, _request, version, event) {
            calls.push(event); await hooks.transition?.(event);
            if (state.run.version !== version || state.run.phase === 'terminal') return conflict();
            const phase = event === 'claim_create' ? 'create_claimed' : event === 'claim_prompt' ? 'prompt_claimed' : event;
            if (event === 'claim_create') { if (state.run.createClaimed || state.run.cancelRequested) return conflict(); state.run.createClaimed = true; }
            if (event === 'claim_prompt') { if (state.run.promptClaimed || state.run.cancelRequested) return conflict(); state.run.promptClaimed = true; }
            state.run.phase = phase; state.run.version++; return snapshot();
        },
        async complete(_thread, _request, version, answer, nativeOutcome, terminalReason) {
            calls.push('complete'); await hooks.complete?.();
            if (state.run.version !== version || state.run.phase === 'terminal') return conflict();
            // Mirror native_complete's fixed answer and cancellation predicates, rather than accepting every fixture answer.
            if (terminalReason === 'answered') {
                assert.equal(state.run.promptClaimed && !state.run.cancelRequested && nativeOutcome === 'succeeded', true);
            } else {
                assert.deepEqual(answer, { outcome: 'insufficient', text: terminalReason === 'cancelled' ? cancelledText : unavailableText, citations: [] });
                if (terminalReason === 'cancelled') assert.equal(state.run.cancelRequested && (state.run.promptClaimed ? nativeOutcome === 'interrupted' : nativeOutcome === null), true);
                else if (state.run.promptClaimed) assert.notEqual(nativeOutcome, null);
            }
            state.complete = structuredClone(answer);
            Object.assign(state.run, { phase: 'terminal', version: version + 1, nativeOutcome, terminalReason, responseHash: sha(JSON.stringify(answer)) });
            if (options.completeLost) throw Error('PRIVATE_DATABASE_ERROR');
            return snapshot();
        },
    };
    const owned = async (receipt, check) => { assert.equal(await check(receipt), true); };
    const native = {
        async create(receipt, check) { calls.push('create'); assert.equal(state.run.phase, 'create_claimed'); await owned(receipt, check); await hooks.create?.(); if (options.createLost) throw new NativeSessionError('unavailable', 'unknown'); return { time: { created: 0, updated: 0 } }; },
        async prompt(receipt, value, check) { calls.push('prompt'); assert.equal(state.run.phase, 'prompt_claimed'); await owned(receipt, check); state.prompt = structuredClone(value); assert.equal(sha(value.text), state.run.promptHash); await hooks.prompt?.(); if (options.promptLost) throw new NativeSessionError('unavailable', 'unknown'); return { status: 'accepted', messageID: value.messageID }; },
        async get(receipt, check) { calls.push('get'); await owned(receipt, check); await hooks.get?.(); return { ...(state.busy ? {} : { outcome: state.outcome }), time: { created: 0, updated: 6, busy: 1, ...(state.busy ? {} : { idle: 6 }) } }; },
        async messages(receipt, check) {
            calls.push('messages'); await owned(receipt, check); await hooks.messages?.();
            return [
                { id: state.prompt.messageID, type: 'user', text: state.prompt.text, created: 2 },
                ...(state.busy ? [] : [{ id: createNativeMessageID(), type: 'assistant', text: state.raw, created: 3, completed: 4, failed: state.outcome !== 'succeeded', retrying: false }, { id: createNativeMessageID(), type: 'idle', outcome: state.outcome, created: 5 }]),
            ];
        },
        async active(receipt, check) { calls.push('active'); await owned(receipt, check); await hooks.active?.(); return { active: state.busy }; },
    };
    const deps = {
        store, native,
        async current(value) { calls.push('current'); assert.equal(value.thread, input.thread); assert.equal(value.request, input.request); if (value.receipt) assert.deepEqual(value.receipt, state.run.receipt); await hooks.current?.(value); return state.current; },
        async authorizeRuntime(purpose) { calls.push('runtime:' + purpose); assert.ok(['dispatch', 'observe'].includes(purpose)); await hooks.runtime?.(purpose); return purpose === 'dispatch' && !state.dispatchAllowed ? null : state.runtime; },
        async ownerBinding() { return state.binding; },
        async prepareEvidence(question) {
            calls.push('prepare'); await hooks.prepare?.();
            return prepareEvidenceContext({ actor: { subject: 'owner' }, input: { question }, current: async () => state.current,
                adapters: { resolveIdentity: async () => options.product ? { kind: 'resolved', product } : { kind: 'clarification' }, currentScope: async () => state.withdrawn ? null : { fingerprint: 'initial', candidate: true, sealed: true, engineeringVerified: true, manifestVerified: true, configVerified: true, generationCurrent: true, chunks: [chunk] }, lexical: async (_question, handles) => handles },
                readScope: async () => ({ productId: product.id, scopeHash: state.scopeHash }),
            });
        },
    };
    return { state, calls, hooks, deps, turn: createNativeTurn(deps) };
}
const count = (fixture, name) => fixture.calls.filter(call => call === name).length;

test('one native prompt owns natural conversation; durable claims precede dispatch and only finalized answer is persisted', async () => {
    const f = fixture();
    assert.deepEqual(await f.turn.start(input), { status: 'saved' });
    assert.equal(count(f, 'create'), 1); assert.equal(count(f, 'prompt'), 1); assert.equal(count(f, 'complete'), 1);
    assert.equal(f.calls.indexOf('admit') < f.calls.indexOf('create'), true);
    assert.deepEqual(f.state.complete, { outcome: output.outcome, text: output.text, citations: [] });
});

test('acknowledgement stays pending; status observes once and never dispatches a second prompt', async () => {
    const f = fixture(); f.state.busy = true;
    assert.deepEqual(await f.turn.start(input), { status: 'pending' });
    assert.equal(count(f, 'complete'), 0);
    f.state.busy = false;
    assert.deepEqual(await f.turn.status(input), { status: 'saved' });
    assert.equal(count(f, 'get'), 2); assert.equal(count(f, 'prompt'), 1); assert.equal(count(f, 'create'), 1);
    assert.deepEqual(await f.turn.start(input), { status: 'saved' });
    assert.equal(count(f, 'prompt'), 1);
});

test('lost create or prompt response becomes unknown and duplicate starts/status never replay a mutation', async () => {
    for (const loss of ['createLost', 'promptLost']) {
        const f = fixture({ [loss]: true });
        assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
        assert.equal(f.state.run.phase, 'unknown');
        for (const action of ['start', 'status']) await f.turn[action](input);
        assert.equal(count(f, 'create'), 1); assert.equal(count(f, 'prompt'), loss === 'promptLost' ? 1 : 0);
        if (loss === 'promptLost') assert.equal(f.state.run.phase, 'terminal');
    }
});

test('concurrent fresh starts admit only one durable identity and send only one prompt', async () => {
    const f = fixture();
    const results = await Promise.all([f.turn.start(input), f.turn.start(input)]);
    assert.equal(results.some(result => result.status === 'saved'), true);
    assert.equal(count(f, 'create'), 1); assert.equal(count(f, 'prompt'), 1); assert.equal(count(f, 'complete'), 1);
});

test('a CAS lost after prompt claim is status-only even if no request was sent', async () => {
    const f = fixture();
    f.hooks.transition = event => { if (event === 'claim_prompt') { f.state.run.cancelRequested = true; f.state.run.version++; throw new ChatStoreError('conflict'); } };
    assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
    await f.turn.start(input);
    assert.equal(count(f, 'create'), 1); assert.equal(count(f, 'prompt'), 0);
});

test('an invalidated claim cannot dispatch after asynchronous admission checks', async () => {
    const f = fixture();
    f.hooks.current = value => {
        if (value.receipt && f.state.run.phase === 'prompt_claimed') {
            f.state.run.phase = 'unknown'; f.state.run.version++;
        }
    };
    assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
    assert.equal(f.state.prompt, null); assert.equal(count(f, 'complete'), 0);
});

test('concurrent terminal observations use CAS and never duplicate native inference', async () => {
    const f = fixture(); f.state.busy = true; await f.turn.start(input); f.state.busy = false;
    const results = await Promise.all([f.turn.status(input), f.turn.status(input)]);
    assert.equal(results.some(result => result.status === 'saved'), true);
    assert.equal(f.state.run.phase, 'terminal');
    assert.equal(count(f, 'prompt'), 1); assert.equal(count(f, 'create'), 1);
});

test('runtime/provider gates, current ownership and abort fail closed before native dispatch', async () => {
    for (const change of [f => { f.state.runtime = null; }, f => { f.state.current = false; }]) {
        const f = fixture(); change(f);
        try { assert.deepEqual(await f.turn.start(input), { status: 'unknown' }); } catch (error) { assert.equal(error.code, 'unauthenticated'); }
        assert.equal(count(f, 'create'), 0); assert.equal(count(f, 'prompt'), 0);
    }
    const f = fixture(), controller = new AbortController(); controller.abort();
    assert.deepEqual(await f.turn.start(input, controller.signal), { status: 'unknown' });
    assert.equal(count(f, 'admit'), 0);
});

test('dispatch admission is separate from safe observation of an existing generation', async () => {
    const blocked = fixture(); blocked.state.dispatchAllowed = false;
    assert.deepEqual(await blocked.turn.start(input), { status: 'unknown' });
    assert.equal(count(blocked, 'admit'), 0); assert.equal(count(blocked, 'create'), 0); assert.equal(count(blocked, 'prompt'), 0);
    for (const action of ['status', 'start']) {
        const f = fixture(); f.state.busy = true;
        assert.deepEqual(await f.turn.start(input), { status: 'pending' });
        f.state.dispatchAllowed = false; f.state.busy = false;
        const dispatchChecks = count(f, 'runtime:dispatch');
        assert.deepEqual(await f.turn[action](input), { status: 'saved' });
        assert.equal(count(f, 'runtime:dispatch'), dispatchChecks);
        assert.equal(count(f, 'prompt'), 1); assert.equal(count(f, 'complete'), 1);
        assert.deepEqual(await f.turn.status(input), { status: 'saved' });
    }
});

test('revocation or generation change after create blocks prompt and preserves claimed state', async () => {
    for (const change of [f => { f.state.current = false; }, f => { f.state.runtime = 'd'.repeat(64); }, f => { f.state.binding = 'e'.repeat(64); }]) {
        const f = fixture(); f.hooks.create = () => change(f);
        assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0); assert.equal(f.state.prompt, null);
        assert.equal(f.state.run.createClaimed, true);
    }
});

test('product citation selection is source-fenced by the shared evidence kernel', async () => {
    const f = fixture({ product: true });
    f.state.raw = JSON.stringify({ outcome: 'evidence', text: 'The listing states 4 pins. [S1]', selections: [{ handle: 'E1', quote: '4 pins' }] });
    assert.deepEqual(await f.turn.start(input), { status: 'saved' });
    assert.equal(f.state.complete.citations[0].sourceUrl, chunk.sourceUrl);
    assert.equal(f.state.prompt.text.includes(product.id), false); assert.equal(f.state.prompt.text.includes(chunk.handle), false);
    assert.deepEqual(f.state.run.scopes, [{ productId: product.id, scopeHash: 'c'.repeat(64) }]);
});

test('withdrawal before prompt or final persistence cannot release product evidence', async () => {
    for (const boundary of ['create', 'active']) {
        const f = fixture({ product: true }); f.hooks[boundary] = () => { f.state.withdrawn = true; };
        assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0);
        if (boundary === 'create') assert.equal(f.state.prompt, null);
    }
});

test('status requires the identical reconstructed prompt, scope and runtime without replacement context', async () => {
    for (const change of [f => { f.state.scopeHash = 'f'.repeat(64); }, f => { f.state.runtime = 'd'.repeat(64); }, f => { f.state.binding = 'e'.repeat(64); }]) {
        const f = fixture({ product: true }); f.state.busy = true;
        await f.turn.start(input); f.state.busy = false; change(f);
        assert.deepEqual(await f.turn.status(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0); assert.equal(count(f, 'prompt'), 1);
    }
    const f = fixture(); f.state.busy = true; await f.turn.start(input); f.state.busy = false;
    assert.deepEqual(await f.turn.status({ ...input, question: 'A different question' }), { status: 'unknown' });
    assert.equal(count(f, 'prompt'), 1);
});

test('malformed JSON, duplicate keys, fences and forged citation choices never persist', async () => {
    for (const raw of ['{"outcome":"conversation","outcome":"evidence","text":"bad","selections":[]}', '```json\n{}\n```', '{', JSON.stringify({ ...output, selections: [{ handle: 'E1', quote: 'invented' }] })]) {
        const f = fixture(); f.state.raw = raw;
        assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0); assert.equal(count(f, 'prompt'), 1);
    }
});

test('native failure and unsolicited interruption use the SQL exact unavailable answer', async () => {
    for (const outcome of ['failed', 'interrupted']) {
        const f = fixture(); f.state.outcome = outcome; f.state.raw = 'PRIVATE_PROVIDER_BODY';
        assert.deepEqual(await f.turn.start(input), { status: 'saved' });
        assert.equal(f.state.run.nativeOutcome, outcome);
        assert.equal(f.state.run.terminalReason, 'unavailable');
        assert.deepEqual(f.state.complete, { outcome: 'insufficient', text: unavailableText, citations: [] });
        assert.equal(JSON.stringify(f.state.complete).includes('PRIVATE'), false);
    }
});

test('only actual native interruption with a durable cancel request persists cancellation', async () => {
    const f = fixture(); f.state.busy = true;
    assert.deepEqual(await f.turn.start(input), { status: 'pending' });
    f.state.run.cancelRequested = true; f.state.run.phase = 'cancel_requested'; f.state.run.version++;
    f.state.busy = false; f.state.outcome = 'interrupted';
    assert.deepEqual(await f.turn.status(input), { status: 'saved' });
    assert.equal(f.state.run.terminalReason, 'cancelled'); assert.equal(f.state.run.nativeOutcome, 'interrupted');
    assert.deepEqual(f.state.complete, { outcome: 'insufficient', text: cancelledText, citations: [] });
    assert.equal(count(f, 'prompt'), 1);
});

test('uncertain completion is reconciled from durable state without inference replay', async () => {
    const f = fixture({ completeLost: true });
    assert.deepEqual(await f.turn.start(input), { status: 'unknown' });
    assert.deepEqual(await f.turn.status(input), { status: 'saved' });
    assert.equal(count(f, 'complete'), 1); assert.equal(count(f, 'prompt'), 1);
});

test('input is bounded and native IDs or browser authority fields are rejected', async () => {
    for (const value of [{ ...input, sessionID: 'forged' }, { ...input, question: '' }, { ...input, question: 'x'.repeat(2001) }, { ...input, request: '../other' }, { ...input, question: '\ud800' }]) {
        const f = fixture(); await assert.rejects(f.turn.start(value), error => error instanceof ChatStoreError && error.code === 'invalid');
        assert.equal(f.calls.length, 0);
    }
    const f = fixture(); await assert.rejects(f.turn.status(input), error => error.code === 'not_found'); assert.equal(count(f, 'admit'), 0);
});
