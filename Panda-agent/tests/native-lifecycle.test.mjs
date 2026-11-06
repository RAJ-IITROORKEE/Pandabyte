import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createNativeLifecycle } from '../src/server/native-lifecycle.ts';
import { createNativeReceipt, createNativeMessageID, NativeSessionError } from '../src/opencode/session-contracts.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const input = { thread: '11111111-1111-4111-8111-111111111111', request: '22222222-2222-4222-8222-222222222222' };
const binding = 'b'.repeat(64), generation = 'a'.repeat(64), prompt = 'Synthetic fixture prompt';
const cancelled = { outcome: 'insufficient', text: 'This request was cancelled. Start a new question when ready.', citations: [] };
const unavailable = { outcome: 'insufficient', text: 'This request ended without a current validated result. No uncertain request was repeated. Start a new question.', citations: [] };
function fixture(options = {}) {
    const phase = options.phase ?? 'accepted';
    const state = {
        current: true, runtime: generation, binding, exists: options.exists ?? phase !== 'admitted', active: phase === 'accepted', nativeOutcome: undefined, children: false, answer: null,
        run: { receipt: createNativeReceipt('customer', binding), messageID: createNativeMessageID(), promptHash: createHash('sha256').update(prompt).digest('hex'), runtimeBinding: generation, scopes: [], phase, version: 1, createClaimed: phase !== 'admitted', promptClaimed: ['accepted', 'prompt_claimed'].includes(phase), cancelRequested: false, terminalReason: null, nativeOutcome: null, responseHash: null, removalClaimed: false, runtimeRetired: false },
    };
    const calls = [], hooks = {};
    const snapshot = () => structuredClone(state.run);
    const conflict = () => { throw new ChatStoreError('conflict'); };
    const store = {
        async state() { calls.push('state'); await hooks.state?.(); return snapshot(); },
        async transition(_thread, _request, version, event) {
            calls.push(event); await hooks.transition?.(event);
            if (state.run.version !== version || state.run.phase === 'terminal') return conflict();
            if (event === 'claim_prompt') { if (state.run.phase !== 'created' || state.run.cancelRequested) return conflict(); state.run.promptClaimed = true; state.run.phase = 'prompt_claimed'; }
            else if (event === 'claim_create') { if (state.run.phase !== 'admitted' || state.run.cancelRequested) return conflict(); state.run.createClaimed = true; state.run.phase = 'create_claimed'; }
            else { assert.equal(event, 'cancel_requested'); state.run.cancelRequested = true; state.run.phase = 'cancel_requested'; }
            state.run.version++; if (options.cancelLost) throw Error('PRIVATE_CANCEL_WRITE'); return snapshot();
        },
        async complete(_thread, _request, version, answer, outcome, reason) {
            calls.push('complete'); await hooks.complete?.();
            if (state.run.version !== version || state.run.phase === 'terminal') return conflict();
            assert.deepEqual(answer, reason === 'cancelled' ? cancelled : unavailable);
            if (reason === 'cancelled') assert.equal(state.run.cancelRequested && (state.run.promptClaimed ? outcome === 'interrupted' : outcome === null), true);
            else if (state.run.promptClaimed) assert.notEqual(outcome, null);
            state.answer = answer; Object.assign(state.run, { phase: 'terminal', nativeOutcome: outcome, terminalReason: reason, responseHash: 'f'.repeat(64), version: version + 1 });
            if (options.completeLost) throw Error('PRIVATE_COMPLETE_WRITE'); return snapshot();
        },
        async claimRemoval(_thread, _request, version) {
            calls.push('claimRemoval'); await hooks.claimRemoval?.();
            if (state.run.phase !== 'terminal' || state.run.removalClaimed || state.run.runtimeRetired || state.run.version !== version) return conflict();
            state.run.removalClaimed = true; state.run.version++;
            if (options.claimLost) throw Error('PRIVATE_CLAIM_WRITE'); return snapshot();
        },
        async retire(_thread, _request, version) {
            calls.push('retire'); await hooks.retire?.();
            if (state.run.phase !== 'terminal' || !state.run.removalClaimed || state.run.version !== version) return conflict();
            state.run.runtimeRetired = true; state.run.version++;
            if (options.retireLost) throw Error('PRIVATE_RETIRE_WRITE'); return snapshot();
        },
    };
    const owned = async (receipt, check) => { if (!await check(receipt)) throw new NativeSessionError('forbidden'); };
    const native = {
        async get(receipt, check) { calls.push('get'); await owned(receipt, check); await hooks.get?.(); if (!state.exists) throw new NativeSessionError(); return { ...(state.nativeOutcome ? { outcome: state.nativeOutcome } : {}), time: { created: 0, updated: 6, ...(state.run.promptClaimed ? { busy: 1 } : {}), ...(state.nativeOutcome ? { idle: 6 } : {}) } }; },
        async active(receipt, check) { calls.push('active'); await owned(receipt, check); await hooks.active?.(); return { active: state.active }; },
        async messages(receipt, check) { calls.push('messages'); await owned(receipt, check); return [{ id: state.run.messageID, type: 'user', text: options.wrongPrompt ? 'Other prompt' : prompt, created: 2 }, ...(state.nativeOutcome ? [{ id: createNativeMessageID(), type: 'assistant', text: 'PRIVATE_MODEL_TEXT', created: 3, completed: 4, failed: state.nativeOutcome !== 'succeeded', retrying: false }, { id: createNativeMessageID(), type: 'idle', outcome: state.nativeOutcome, created: 5 }] : [])]; },
        async interrupt(receipt, check) {
            await owned(receipt, check); calls.push('interrupt'); assert.equal(state.run.cancelRequested, true); await hooks.interrupt?.();
            if (options.interruptLost) throw new NativeSessionError('unavailable', 'unknown');
            if (options.ackOnly) return { status: 'unknown' };
            state.active = false; state.nativeOutcome = options.finishOutcome ?? 'interrupted';
            return { status: state.nativeOutcome === 'interrupted' ? 'cancelled' : 'already_terminal', outcome: state.nativeOutcome };
        },
        async remove(receipt, check) {
            await owned(receipt, check); calls.push('remove'); assert.equal(state.run.phase, 'terminal'); assert.equal(state.run.removalClaimed, true);
            if (state.active || state.children || !state.exists) throw new NativeSessionError();
            await hooks.remove?.(); await owned(receipt, check); state.exists = false;
            if (options.deleteLost) throw new NativeSessionError('unavailable', 'unknown');
            return { status: 'removed' };
        },
        async absence(receipt, check) { calls.push('absence'); await owned(receipt, check); await hooks.absence?.(); if (state.exists) throw new NativeSessionError(); return { absent: true }; },
    };
    const deps = { store, native,
        async current(value) { calls.push('current'); assert.equal(value.thread, input.thread); assert.equal(value.request, input.request); if (value.receipt) assert.deepEqual(value.receipt, state.run.receipt); await hooks.current?.(); return state.current; },
        async authorizeRuntime(purpose) { calls.push('runtime:' + purpose); assert.equal(purpose, 'observe'); return state.runtime; },
        async ownerBinding() { return state.binding; },
    };
    return { state, calls, hooks, store, lifecycle: createNativeLifecycle(deps) };
}
const count = (f, name) => f.calls.filter(call => call === name).length;
const terminal = f => { Object.assign(f.state.run, { phase: 'terminal', nativeOutcome: 'interrupted', terminalReason: 'cancelled', cancelRequested: true, responseHash: 'f'.repeat(64) }); f.state.active = false; f.state.nativeOutcome = 'interrupted'; };

test('sticky cancellation is persisted before one interrupt and only correlated inactive interruption saves cancelled', async () => {
    const f = fixture(); assert.deepEqual(await f.lifecycle.cancel(input), { status: 'saved' });
    assert.equal(f.calls.indexOf('cancel_requested') < f.calls.indexOf('interrupt'), true);
    assert.deepEqual(f.state.answer, cancelled); assert.equal(f.state.run.nativeOutcome, 'interrupted');
    await f.lifecycle.cancel(input); await f.lifecycle.status(input); assert.equal(count(f, 'interrupt'), 1);
});

test('interrupt acknowledgement, lost response and late prompt stay status-only without another interrupt', async () => {
    for (const option of ['ackOnly', 'interruptLost', 'cancelLost']) {
        const f = fixture({ [option]: true });
        assert.deepEqual(await f.lifecycle.cancel(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0);
        await f.lifecycle.cancel(input); await f.lifecycle.status(input);
        assert.equal(count(f, 'interrupt'), option === 'cancelLost' ? 0 : 1);
        assert.equal(count(f, 'complete'), 0);
        f.state.active = false; f.state.nativeOutcome = 'interrupted';
        assert.deepEqual(await f.lifecycle.status(input), { status: 'saved' });
    }
});

test('a terminal failure or success after cancellation persists only the exact SQL unavailable answer', async () => {
    for (const outcome of ['failed', 'succeeded']) {
        const f = fixture({ finishOutcome: outcome });
        assert.deepEqual(await f.lifecycle.cancel(input), { status: 'saved' });
        assert.deepEqual(f.state.answer, unavailable); assert.equal(f.state.run.terminalReason, 'unavailable');
        assert.equal(JSON.stringify(f.state.answer).includes('PRIVATE'), false);
    }
});

test('stale or different prompt history cannot confirm cancellation', async () => {
    const f = fixture({ wrongPrompt: true });
    assert.deepEqual(await f.lifecycle.cancel(input), { status: 'unknown' }); assert.equal(count(f, 'complete'), 0);
});

test('cancellation before any create claim safely closes without native mutation and prevents future create', async () => {
    const f = fixture({ phase: 'admitted' });
    assert.deepEqual(await f.lifecycle.cancel(input), { status: 'saved' }); assert.equal(f.state.run.nativeOutcome, null);
    assert.equal(count(f, 'get'), 0); assert.equal(count(f, 'interrupt'), 0);
    await assert.rejects(f.store.transition(input.thread, input.request, f.state.run.version, 'claim_create'), error => error.code === 'conflict');
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'retired' });
    assert.equal(count(f, 'remove'), 0); assert.equal(count(f, 'absence'), 1);
});

test('missing unknown create cannot settle or retire; late committed creation can later be observed safely', async () => {
    const f = fixture({ phase: 'create_claimed', exists: false });
    assert.deepEqual(await f.lifecycle.cancel(input), { status: 'unknown' });
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' });
    assert.equal(count(f, 'complete'), 0); assert.equal(count(f, 'absence'), 0); assert.equal(count(f, 'retire'), 0);
    f.state.exists = true;
    assert.deepEqual(await f.lifecycle.status(input), { status: 'saved' });
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'retired' });
    assert.equal(count(f, 'remove'), 1);
});

test('owned committed unprompted creation can be cancelled while sticky flag prevents a prompt claim', async () => {
    const f = fixture({ phase: 'created' });
    f.hooks.complete = async () => { await assert.rejects(f.store.transition(input.thread, input.request, f.state.run.version, 'claim_prompt'), error => error.code === 'conflict'); };
    assert.deepEqual(await f.lifecycle.cancel(input), { status: 'saved' });
    assert.deepEqual(f.state.answer, cancelled); assert.equal(count(f, 'interrupt'), 0);
});

test('concurrent cancellation admits at most one interrupt and uses CAS for settlement', async () => {
    const f = fixture(); await Promise.all([f.lifecycle.cancel(input), f.lifecycle.cancel(input)]);
    assert.equal(count(f, 'interrupt'), 1); assert.equal(f.state.run.phase, 'terminal');
});

test('create or prompt claim winning a cancellation race retains unknown work rather than false settlement', async () => {
    for (const claim of ['create', 'prompt']) {
        const f = fixture({ phase: claim === 'create' ? 'admitted' : 'created', exists: false });
        f.hooks.transition = event => { if (event === 'cancel_requested') { f.state.run.version++; f.state.run.createClaimed = true; f.state.run.phase = claim + '_claimed'; f.state.run.promptClaimed = claim === 'prompt'; } };
        assert.deepEqual(await f.lifecycle.cancel(input), { status: 'unknown' });
        assert.equal(count(f, 'complete'), 0); assert.equal(count(f, 'retire'), 0); assert.equal(count(f, 'interrupt'), 0);
    }
});

test('terminal cleanup consumes one removal CAS and never repeats DELETE after an uncertain outcome', async () => {
    const f = fixture({ deleteLost: true }); terminal(f);
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' });
    assert.equal(f.state.run.removalClaimed, true); assert.equal(f.state.run.runtimeRetired, false);
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'retired' });
    assert.equal(count(f, 'remove'), 1); assert.equal(count(f, 'absence'), 1); assert.equal(count(f, 'retire'), 1);
});

test('lost removal claim acknowledgement authorizes absence only, never a later DELETE', async () => {
    const f = fixture({ claimLost: true }); terminal(f);
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' });
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' });
    assert.equal(count(f, 'remove'), 0); assert.equal(count(f, 'absence'), 1); assert.equal(count(f, 'retire'), 0);
});

test('cleanup refuses nonterminal, active, child-bearing, unknown-create and mismatched native terminal state', async () => {
    const pending = fixture(); assert.deepEqual(await pending.lifecycle.cleanup(input), { status: 'unknown' }); assert.equal(count(pending, 'claimRemoval'), 0);
    for (const change of [f => { f.state.active = true; }, f => { f.state.children = true; }, f => { f.state.nativeOutcome = 'succeeded'; }, f => { f.state.exists = false; }]) {
        const f = fixture(); terminal(f); change(f);
        assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' }); assert.equal(count(f, 'retire'), 0);
    }
});

test('concurrent cleanup permits only one DELETE; retirement uncertainty is read back without replay', async () => {
    const f = fixture({ retireLost: true }); terminal(f);
    await Promise.all([f.lifecycle.cleanup(input), f.lifecycle.cleanup(input)]);
    assert.equal(count(f, 'remove'), 1);
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'retired' }); assert.equal(count(f, 'retire'), 1);
});

test('invalidated cancel or removal claims block native effects and preserve the cleanup receipt', async () => {
    const cancelling = fixture(); let changed = false;
    cancelling.hooks.current = () => {
        if (cancelling.state.run.phase === 'cancel_requested' && !changed) { cancelling.state.run.version++; changed = true; }
    };
    assert.deepEqual(await cancelling.lifecycle.cancel(input), { status: 'unknown' });
    assert.equal(count(cancelling, 'interrupt'), 0); assert.equal(count(cancelling, 'complete'), 0);
    for (const change of [f => { f.state.run.version++; }, f => { f.state.run.messageID = createNativeMessageID(); }]) {
        const f = fixture(); terminal(f); f.hooks.remove = () => change(f);
        assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' });
        assert.equal(f.state.exists, true); assert.equal(f.state.run.runtimeRetired, false); assert.equal(count(f, 'retire'), 0);
        await f.lifecycle.cleanup(input); assert.equal(count(f, 'remove'), 1);
    }
});

test('ownership, generation, immutable journal identity, abort and mid-operation revocation fence all native effects', async () => {
    for (const change of [f => { f.state.runtime = null; }, f => { f.state.runtime = 'e'.repeat(64); }, f => { f.state.binding = 'e'.repeat(64); }, f => { f.state.current = false; }]) {
        const f = fixture(); change(f);
        try { assert.deepEqual(await f.lifecycle.cancel(input), { status: 'unknown' }); } catch (error) { assert.equal(error.code, 'unauthenticated'); }
        assert.equal(count(f, 'interrupt'), 0); assert.equal(count(f, 'complete'), 0);
    }
    const f = fixture(); terminal(f); f.hooks.remove = () => { f.state.runtime = 'e'.repeat(64); };
    assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'unknown' }); assert.equal(count(f, 'retire'), 0);
    const revoked = fixture(); revoked.hooks.interrupt = () => { revoked.state.current = false; };
    await assert.rejects(revoked.lifecycle.cancel(input), error => error.code === 'unauthenticated'); assert.equal(count(revoked, 'complete'), 0);
    const aborted = fixture(), controller = new AbortController(); controller.abort();
    assert.deepEqual(await aborted.lifecycle.cancel(input, controller.signal), { status: 'unknown' }); assert.equal(count(aborted, 'cancel_requested'), 0);
});

test('no source or new-dispatch admission is required for cancellation and cleanup', async () => {
    const f = fixture(); assert.deepEqual(await f.lifecycle.cancel(input), { status: 'saved' }); assert.deepEqual(await f.lifecycle.cleanup(input), { status: 'retired' });
    assert.equal(f.calls.some(call => call === 'runtime:dispatch'), false);
});

test('only bounded app identity is accepted; private native IDs and absent mappings never become authority', async () => {
    for (const value of [{ ...input, sessionID: 'forged' }, { ...input, thread: '../other' }, { ...input, request: null }]) {
        const f = fixture(); await assert.rejects(f.lifecycle.cancel(value), error => error.code === 'invalid'); assert.equal(f.calls.length, 0);
    }
    const f = fixture(); f.state.run = null; await assert.rejects(f.lifecycle.cancel(input), error => error.code === 'not_found');
});
