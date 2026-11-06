import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createNativeRunStore } from '../src/server/native-run-store.ts';
import { createNativeReceipt, createNativeMessageID } from '../src/opencode/session-contracts.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const thread = '11111111-1111-4111-8111-111111111111';
const request = '22222222-2222-4222-8222-222222222222';
const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = 'ab'.repeat(32);
const receipt = createNativeReceipt('customer', 'b'.repeat(64));
const input = { thread, request, question: 'Fixture question', receipt, messageID: createNativeMessageID(), promptHash: 'c'.repeat(64), runtimeBinding: 'd'.repeat(64), scopes: [{ productId, scopeHash: 'e'.repeat(64) }] };
const pending = { receipt, messageID: input.messageID, promptHash: input.promptHash, runtimeBinding: input.runtimeBinding, scopes: input.scopes, phase: 'admitted', version: 1, createClaimed: false, promptClaimed: false, cancelRequested: false, terminalReason: null, nativeOutcome: null, responseHash: null, runtimeRetired: false };
const answer = { outcome: 'conversation', text: 'Fixture answer', citations: [] };
const terminal = { ...pending, phase: 'terminal', version: 3, createClaimed: true, promptClaimed: true, terminalReason: 'answered', nativeOutcome: 'succeeded', responseHash: 'f'.repeat(64) };
const failure = code => error => error instanceof ChatStoreError && error.code === code && error.message === code;
function fixture(data = pending, options = {}) {
    const calls = [];
    const actor = { subject: 'fixture-owner', sessionId: 'PRIVATE_SESSION', client: { database: { schema(schema) {
        assert.equal(schema, 'public');
        return { async rpc(name, args) {
            calls.push({ schema, name, args });
            if (options.throw) throw options.throw;
            return options.response ?? { data: structuredClone(data), error: null };
        } };
    } } } };
    return { store: createNativeRunStore(actor, key), calls, actor };
}

test('each native journal operation signs a short-lived nested actor envelope in a distinct HMAC namespace', async () => {
    const operations = [
        ['admit', { admitted: true, state: pending }, store => store.admit(input)],
        ['state', pending, store => store.state(thread, request)],
        ['transition', { ...pending, phase: 'create_claimed', createClaimed: true, version: 2 }, store => store.transition(thread, request, 1, 'claim_create')],
        ['complete', terminal, store => store.complete(thread, request, 2, answer, 'succeeded', 'answered')],
        ['retire', { ...terminal, version: 4, runtimeRetired: true }, store => store.retire(thread, request, 3)],
    ];
    for (const [action, result, perform] of operations) {
        const current = fixture(result);
        const before = Math.floor(Date.now() / 1000);
        await perform(current.store);
        assert.equal(current.calls.length, 1);
        const { name, args } = current.calls[0];
        assert.equal(name, `panda_agent_native_${action}`);
        assert.deepEqual(Object.keys(args).sort(), ['p_mac', 'p_payload']);
        const payload = JSON.parse(args.p_payload);
        assert.deepEqual(Object.keys(payload).sort(), ['action', 'exp', 'input', 'subject', 'v']);
        assert.equal(payload.v, 1); assert.equal(payload.action, action); assert.equal(payload.subject, 'fixture-owner');
        assert.equal(payload.exp >= before + 60 && payload.exp <= Math.floor(Date.now() / 1000) + 60, true);
        assert.equal(payload.input.thread, thread); assert.equal(payload.input.request, request);
        assert.equal(args.p_mac, createHmac('sha256', Buffer.from(key, 'hex')).update('panda-native-db-v1\n' + args.p_payload).digest('hex'));
        assert.notEqual(args.p_mac, createHmac('sha256', Buffer.from(key, 'hex')).update('panda-lightweight-db-v1\n' + args.p_payload).digest('hex'));
        assert.equal(args.p_payload.includes('PRIVATE_SESSION'), false);
        assert.equal(Buffer.byteLength(args.p_payload) <= 32768, true);
    }
});

test('admission and duplicate replay preserve exact immutable native identity and scope', async () => {
    const current = fixture({ admitted: true, state: pending });
    assert.deepEqual(await current.store.admit(input), { admitted: true, state: pending });
    assert.deepEqual(JSON.parse(current.calls[0].args.p_payload).input, input);
    assert.deepEqual(await fixture({ admitted: false, state: pending }).store.admit(input), { admitted: false, state: pending });
    for (const fields of [{ receipt: createNativeReceipt('customer', '1'.repeat(64)) }, { messageID: createNativeMessageID() }, { promptHash: '1'.repeat(64) }, { runtimeBinding: '1'.repeat(64) }, { scopes: [] }]) {
        for (const admitted of [true, false]) await assert.rejects(fixture({ admitted, state: { ...pending, ...fields } }).store.admit(input), failure('unavailable'));
    }
    assert.equal(await fixture(null).store.state(thread, request), null);
});

test('caller identity is fixed by the actor and cannot be supplied through admission fields', async () => {
    const current = fixture({ admitted: true, state: pending });
    current.actor.subject = 'foreign-actor';
    await current.store.admit(input);
    assert.equal(JSON.parse(current.calls[0].args.p_payload).subject, 'fixture-owner');
    await assert.rejects(current.store.admit({ ...input, subject: 'foreign-actor' }), failure('invalid'));
    await assert.rejects(current.store.admit({ ...input, sessionId: 'foreign-session' }), failure('invalid'));
    assert.equal(current.calls.length, 1);
});

test('forged receipts and playground history are rejected before database admission', async () => {
    const current = fixture();
    const invalid = [
        { ...receipt, sessionID: '../../private' }, { ...receipt, title: 'foreign-title' }, { ...receipt, nonce: 'x' },
        { ...receipt, binding: 'foreign-owner' }, { ...receipt, scope: 'playground', title: `panda-agent-playground-${receipt.nonce}` },
        { ...receipt, owner: 'foreign-owner' },
    ];
    for (const value of invalid) await assert.rejects(current.store.admit({ ...input, receipt: value }), failure('invalid'));
    assert.equal(current.calls.length, 0);
    for (const value of invalid) await assert.rejects(fixture({ ...pending, receipt: value }).store.state(thread, request), failure('unavailable'));
});

test('bounded UUIDs, question, hashes, scopes and native message IDs fail before RPC', async () => {
    const current = fixture();
    for (const fields of [
        { thread: 'foreign' }, { request: null }, { question: '' }, { question: 'x'.repeat(2001) }, { question: '\ud800' },
        { messageID: 'msg_forged' }, { promptHash: 'x' }, { runtimeBinding: 'x' },
        { scopes: Array.from({ length: 5 }, () => input.scopes[0]) }, { scopes: [input.scopes[0], input.scopes[0]] },
        { scopes: [input.scopes[0], { ...input.scopes[0], productId: productId.toUpperCase() }] },
        { scopes: [{ productId, scopeHash: 'x' }] }, { scopes: [{ ...input.scopes[0], rawSource: 'PRIVATE' }] },
    ]) await assert.rejects(current.store.admit({ ...input, ...fields }), failure('invalid'));
    for (const args of [['foreign', request], [thread, 'foreign']]) {
        await assert.rejects(current.store.state(...args), failure('invalid'));
        await assert.rejects(current.store.transition(...args, 1, 'unknown'), failure('invalid'));
        await assert.rejects(current.store.complete(...args, 1, answer, null, 'unavailable'), failure('invalid'));
        await assert.rejects(current.store.retire(...args, 1), failure('invalid'));
    }
    for (const version of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(current.store.transition(thread, request, version, 'unknown'), failure('invalid'));
        await assert.rejects(current.store.complete(thread, request, version, answer, null, 'unavailable'), failure('invalid'));
        await assert.rejects(current.store.retire(thread, request, version), failure('invalid'));
    }
    await assert.rejects(current.store.transition(thread, request, 1, 'execute_tool'), failure('invalid'));
    assert.equal(current.calls.length, 0);
});

test('private state rejects malformed phases, flags, missing keys and forged terminal combinations', async () => {
    for (const fields of [
        { phase: 'executing' }, { version: 0 }, { version: '1' }, { createClaimed: 1 }, { promptClaimed: 'true' }, { cancelRequested: null }, { runtimeRetired: true }, { runtimeRetired: 'true' },
        { phase: 'admitted', createClaimed: true }, { phase: 'create_claimed', createClaimed: false },
        { phase: 'accepted', createClaimed: true, promptClaimed: false }, { phase: 'unknown', promptClaimed: true },
        { phase: 'cancel_requested', cancelRequested: false }, { phase: 'terminal' },
        { terminalReason: 'answered' }, { responseHash: 'f'.repeat(64) }, { nativeOutcome: 'failed' },
        { scopes: [...input.scopes, ...input.scopes] }, { rawProviderError: 'PRIVATE_ERROR' },
    ]) await assert.rejects(fixture({ ...pending, ...fields }).store.state(thread, request), failure('unavailable'));
    const missing = { ...pending }; delete missing.runtimeBinding;
    await assert.rejects(fixture(missing).store.state(thread, request), failure('unavailable'));
    for (const outcome of [null, 'succeeded', 'failed']) await assert.rejects(fixture({ ...terminal, terminalReason: 'cancelled', nativeOutcome: outcome }).store.state(thread, request), failure('unavailable'));
    const preDispatchCancel = { ...pending, phase: 'terminal', version: 2, cancelRequested: true, terminalReason: 'cancelled', responseHash: 'f'.repeat(64) };
    assert.deepEqual(await fixture(preDispatchCancel).store.state(thread, request), preDispatchCancel);
    const interrupted = { ...terminal, cancelRequested: true, terminalReason: 'cancelled', nativeOutcome: 'interrupted' };
    assert.deepEqual(await fixture(interrupted).store.state(thread, request), interrupted);
});

test('all supported lifecycle events preserve exact event and version in the signed RPC input', async () => {
    for (const event of ['claim_create', 'created', 'claim_prompt', 'accepted', 'cancel_requested', 'unknown']) {
        const phase = event === 'claim_create' ? 'create_claimed' : event === 'claim_prompt' ? 'prompt_claimed' : event;
        const current = fixture({ ...pending, phase, version: 8, createClaimed: true, promptClaimed: ['claim_prompt', 'accepted', 'unknown'].includes(event), cancelRequested: event === 'cancel_requested' });
        await current.store.transition(thread, request, 7, event);
        assert.deepEqual(JSON.parse(current.calls[0].args.p_payload).input, { thread, request, expectedVersion: 7, event });
    }
});

test('CAS response checks reject wrong transitions and preserve idempotent completed or retired replay', async () => {
    for (const fields of [{ version: 1 }, { version: 3 }, { phase: 'created' }]) await assert.rejects(fixture({ ...pending, phase: 'create_claimed', createClaimed: true, version: 2, ...fields }).store.transition(thread, request, 1, 'claim_create'), failure('unavailable'));
    assert.deepEqual(await fixture(terminal).store.complete(thread, request, 3, answer, 'succeeded', 'answered'), terminal);
    assert.deepEqual(await fixture(terminal).store.complete(thread, request, 1, answer, 'succeeded', 'answered'), terminal);
    for (const fields of [{ nativeOutcome: 'failed' }, { terminalReason: 'unavailable' }, { version: 1 }]) await assert.rejects(fixture({ ...terminal, ...fields }).store.complete(thread, request, 2, answer, 'succeeded', 'answered'), failure('unavailable'));
    const retired = { ...terminal, runtimeRetired: true, version: 4 };
    assert.deepEqual(await fixture(retired).store.retire(thread, request, 3), retired);
    assert.deepEqual(await fixture(retired).store.retire(thread, request, 4), retired);
    assert.deepEqual(await fixture(retired).store.retire(thread, request, 2), retired);
    await assert.rejects(fixture(terminal).store.retire(thread, request, 3), failure('unavailable'));
    await assert.rejects(fixture(retired).store.retire(thread, request, 5), failure('unavailable'));
});

test('completion validates and cleans saved answers without leaking raw extra fields', async () => {
    const current = fixture(terminal);
    await current.store.complete(thread, request, 2, { ...answer, privateReasoning: 'PRIVATE_REASONING' }, 'succeeded', 'answered');
    assert.deepEqual(JSON.parse(current.calls[0].args.p_payload).input, { thread, request, expectedVersion: 2, answer, nativeOutcome: 'succeeded', terminalReason: 'answered' });
    for (const value of [null, { ...answer, text: '' }, { ...answer, outcome: 'evidence' }, { ...answer, citations: [{ sourceUrl: 'https://unapproved.invalid/' }] }]) await assert.rejects(current.store.complete(thread, request, 2, value, 'succeeded', 'answered'), failure('invalid'));
    await assert.rejects(current.store.complete(thread, request, 2, answer, 'pending', 'answered'), failure('invalid'));
    await assert.rejects(current.store.complete(thread, request, 2, answer, null, 'failed'), failure('invalid'));
    assert.equal(current.calls.length, 1);
});

test('signed JSON limit is measured in UTF-8 bytes after cleaning the answer', async () => {
    const current = fixture(terminal);
    const citation = { id: 'fixture', title: '界'.repeat(300), quote: '界'.repeat(600), capturedAt: '2026-11-06T00:00:00.000Z', sourceUrl: 'https://pandabyte.in/product-page/fixture', sectionPath: ['Fixture'] };
    const oversized = { outcome: 'evidence', text: '界'.repeat(8000), citations: Array.from({ length: 4 }, () => citation) };
    await assert.rejects(current.store.complete(thread, request, 2, oversized, 'succeeded', 'answered'), failure('invalid'));
    assert.equal(current.calls.length, 0);
});

test('known database revocation/conflict codes survive and raw provider or transport errors are sanitized', async () => {
    for (const code of ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota']) {
        const current = fixture(null, { response: { data: null, error: { code: 'P0001', details: code, message: 'PRIVATE_DATABASE_DATA' } } });
        await assert.rejects(current.store.state(thread, request), failure(code));
    }
    for (const error of [{ code: 'P0001', details: 'PRIVATE_DATABASE_DATA' }, { code: '42501', details: 'unauthenticated', message: 'PRIVATE' }, 'PRIVATE']) {
        await assert.rejects(fixture(null, { response: { data: null, error } }).store.state(thread, request), failure('unavailable'));
    }
    await assert.rejects(fixture(null, { throw: Error('PRIVATE_TRANSPORT_PASSWORD') }).store.state(thread, request), failure('unavailable'));
    await assert.rejects(fixture(null, { response: {} }).store.state(thread, request), failure('unavailable'));
});

test('admission envelope and configuration reject malformed typed values', async () => {
    const current = fixture();
    for (const value of [null, {}, { admitted: 1, state: pending }, { admitted: true, state: pending, private: 'PRIVATE' }, { admitted: true, state: null }]) await assert.rejects(fixture(value).store.admit(input), failure('unavailable'));
    for (const value of ['', 'a'.repeat(63), 'A'.repeat(64), null]) assert.throws(() => createNativeRunStore(current.actor, value), failure('unavailable'));
    for (const subject of ['', 'x'.repeat(513), '\ud800']) assert.throws(() => createNativeRunStore({ ...current.actor, subject }, key), failure('unavailable'));
});
