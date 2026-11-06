import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createNativeOwnerAdmission } from '../src/server/native-owner.ts';
import { createNativeReceipt, createNativeMessageID } from '../src/opencode/session-contracts.ts';
import { ChatStoreError } from '../src/server/chat-store.ts';

const thread = 'aaaaaaaa-1111-4111-8111-111111111111', request = 'bbbbbbbb-2222-4222-8222-222222222222', key = 'ab'.repeat(32);
const turn = () => ({ requestId: request, question: 'Fixture question', status: 'pending', response: null, createdAt: '2026-11-06T00:00:00Z' });
async function fixture(subject = 'fixture-owner', sessionId = 'fixture-clerk-session') {
    const actor = { subject, sessionId, client: {} }, calls = [], hooks = {};
    const data = { active: true, read: { thread: { id: thread, title: 'Fixture chat', updatedAt: '2026-11-06T00:00:00Z', status: 'idle', archivedAt: null }, messages: [], turns: [] }, run: null };
    const options = { actor, key,
        async current(candidate) { calls.push('current'); assert.equal(candidate.subject, subject); assert.equal(candidate.sessionId, sessionId); assert.equal(candidate.client, actor.client); await hooks.current?.(); return data.active; },
        async read(id) { calls.push('read'); assert.equal(id, thread); await hooks.read?.(); return data.read; },
        async state(id, req) { calls.push('state'); assert.equal(id, thread); assert.equal(req, request); await hooks.state?.(); return data.run; },
    };
    const admission = createNativeOwnerAdmission(options);
    const receipt = createNativeReceipt('customer', await admission.ownerBinding(thread));
    data.run = { receipt, messageID: createNativeMessageID(), promptHash: 'c'.repeat(64), runtimeBinding: 'd'.repeat(64), scopes: [], phase: 'admitted', version: 1, createClaimed: false, promptClaimed: false, cancelRequested: false, terminalReason: null, nativeOutcome: null, responseHash: null, removalClaimed: false, runtimeRetired: false };
    return { actor, calls, hooks, data, options, admission, receipt };
}

test('binding uses a distinct HMAC namespace and canonical thread, without exposing identity in receipts', async () => {
    const f = await fixture();
    const expected = createHmac('sha256', Buffer.from(key, 'hex')).update('panda-native-owner-v1\n' + JSON.stringify({ subject: f.actor.subject, thread })).digest('hex');
    assert.equal(await f.admission.ownerBinding(thread), expected);
    assert.equal(await f.admission.ownerBinding(thread.toUpperCase()), expected);
    assert.match(expected, /^[a-f0-9]{64}$/); assert.equal(JSON.stringify(f.receipt).includes(f.actor.subject), false);
    const other = await fixture('other-owner'); assert.notEqual(await other.admission.ownerBinding(thread), expected);
    assert.notEqual(await f.admission.ownerBinding(request), expected);
    assert.notEqual(createHmac('sha256', Buffer.from(key, 'hex')).update('panda-native-db-v1\n' + JSON.stringify({ subject: f.actor.subject, thread })).digest('hex'), expected);
    assert.deepEqual(f.calls, []);
});

test('receipt-free preadmission fences an owner read with current session checks and no state mutation', async () => {
    const f = await fixture(); f.data.run = null;
    assert.equal(await f.admission.current({ thread: thread.toUpperCase(), request: request.toUpperCase() }), true);
    assert.deepEqual(f.calls, ['current', 'read', 'current']);
});

test('native receipt admission uses authorized SQL journal ownership and exact durable customer receipt', async () => {
    const f = await fixture(); f.data.read.turns = [turn()];
    assert.equal(await f.admission.current({ thread, request, receipt: f.receipt }), true);
    assert.deepEqual(f.calls, ['current', 'state', 'current']);
    f.data.read.thread.archivedAt = '2026-11-06T01:00:00Z';
    assert.equal(await f.admission.current({ thread, request, receipt: f.receipt }), true);
});

test('delayed receipt checks perform exactly two fresh session checks and one SQL lookup without history', async () => {
    const f = await fixture(), delay = () => new Promise(resolve => setTimeout(resolve, 3));
    f.hooks.current = delay; f.hooks.state = delay;
    f.hooks.read = () => assert.fail('Receipt admission must not read history');
    assert.equal(await f.admission.current({ thread: thread.toUpperCase(), request: request.toUpperCase(), receipt: f.receipt }), true);
    assert.deepEqual(f.calls, ['current', 'state', 'current']);
    f.data.read = null;
    assert.equal(await f.admission.current({ thread, request, receipt: f.receipt }), true);
    assert.equal(f.calls.filter(call => call === 'current').length, 4);
    assert.equal(f.calls.filter(call => call === 'state').length, 2);
    assert.equal(f.calls.includes('read'), false);
});

test('revoked current session fails before read, after read or after journal observation', async () => {
    const early = await fixture(); early.data.active = false;
    assert.equal(await early.admission.current({ thread, request }), false); assert.deepEqual(early.calls, ['current']);
    const readRace = await fixture(); readRace.hooks.read = () => { readRace.data.active = false; };
    assert.equal(await readRace.admission.current({ thread, request }), false); assert.equal(readRace.calls.includes('state'), false);
    const journalRace = await fixture(); journalRace.data.read.turns = [turn()]; journalRace.hooks.state = () => { journalRace.data.active = false; };
    assert.equal(await journalRace.admission.current({ thread, request, receipt: journalRace.receipt }), false);
});

test('captured subject and session cannot be changed through mutable actor or options objects', async () => {
    const f = await fixture(); const original = await f.admission.ownerBinding(thread);
    f.actor.subject = 'foreign-owner'; f.actor.sessionId = 'foreign-session'; f.options.key = 'cd'.repeat(32);
    f.options.current = async () => assert.fail('Replaced callback must not run');
    assert.equal(await f.admission.ownerBinding(thread), original);
    assert.equal(await f.admission.current({ thread, request }), true);
});

test('closed inputs reject browser authority, malformed UUIDs and explicit invalid receipts before reads', async () => {
    for (const value of [{ thread, request, subject: 'owner' }, { thread, request, nativeSessionID: 'forged' }, { thread: '../other', request }, { thread, request: null }, { thread, request, receipt: undefined }, { thread, request, receipt: null }]) {
        const f = await fixture(); assert.equal(await f.admission.current(value), false); assert.equal(f.calls.length, 0);
    }
    const f = await fixture(); await assert.rejects(f.admission.ownerBinding('../other'), error => error instanceof ChatStoreError && error.code === 'invalid');
});

test('forged receipt scope, nonce, title, ID, binding and extra fields cannot authorize native access', async () => {
    const f = await fixture(); f.data.read.turns = [turn()];
    const forgeries = [{ ...f.receipt, scope: 'playground', title: `panda-agent-playground-${f.receipt.nonce}` }, { ...f.receipt, nonce: '0'.repeat(32) }, { ...f.receipt, title: 'forged' }, { ...f.receipt, sessionID: 'ses_forged' }, { ...f.receipt, binding: 'e'.repeat(64) }, { ...f.receipt, owner: 'forged' }];
    for (const receipt of forgeries) assert.equal(await f.admission.current({ thread, request, receipt }), false);
    assert.equal(f.calls.includes('state'), false);
});

test('another valid native receipt or owner binding never replaces the durable journal receipt', async () => {
    const f = await fixture(); f.data.read.turns = [turn()];
    const otherSession = createNativeReceipt('customer', f.receipt.binding);
    assert.equal(await f.admission.current({ thread, request, receipt: otherSession }), false);
    f.data.run.receipt = otherSession;
    assert.equal(await f.admission.current({ thread, request, receipt: f.receipt }), false);
    const foreign = await fixture('foreign-owner'); f.data.run.receipt = foreign.receipt;
    assert.equal(await f.admission.current({ thread, request, receipt: foreign.receipt }), false);
});

test('missing, wrong-thread and ambiguous fenced reads or journal mappings fail closed', async () => {
    for (const change of [f => { f.data.run = null; }, f => { f.data.run.receipt = { ...f.receipt, extra: 'forged' }; }]) {
        const f = await fixture(); f.data.read.turns = [turn()]; change(f);
        assert.equal(await f.admission.current({ thread, request, receipt: f.receipt }), false);
    }
    for (const change of [f => { f.data.read.thread.id = request; }, f => { f.data.read = null; }, f => { f.data.read.messages = null; }]) {
        const f = await fixture(); change(f);
        assert.equal(await f.admission.current({ thread, request }), false);
    }
    const duplicate = await fixture(); duplicate.data.read.turns = [turn(), { ...turn(), requestId: request.toUpperCase() }];
    assert.equal(await duplicate.admission.current({ thread, request }), false);
});

test('receipt arguments are snapshotted before asynchronous reads', async () => {
    const f = await fixture(); f.data.read.turns = [turn()]; const supplied = { ...f.receipt };
    f.hooks.state = () => { supplied.binding = 'e'.repeat(64); supplied.sessionID = createNativeReceipt('customer', f.receipt.binding).sessionID; };
    assert.equal(await f.admission.current({ thread, request, receipt: supplied }), true);
    assert.equal(supplied.binding, 'e'.repeat(64));
});

test('provider/database/current-session exceptions return only false without raw failures', async () => {
    for (const point of ['current', 'read', 'state']) {
        const f = await fixture(); f.data.read.turns = [turn()]; f.hooks[point] = () => { throw Error('PRIVATE_SERVICE_DETAIL'); };
        assert.equal(await f.admission.current({ thread, request, ...(point === 'read' ? {} : { receipt: f.receipt }) }), false);
    }
});

test('invalid signing key and missing active Clerk identity are safe construction errors', async () => {
    const f = await fixture();
    for (const actor of [{ ...f.actor, subject: '' }, { ...f.actor, sessionId: undefined }, { ...f.actor, subject: '\ud800' }, { ...f.actor, client: null }]) assert.throws(() => createNativeOwnerAdmission({ ...f.options, actor }), error => error instanceof ChatStoreError && error.code === 'unauthenticated');
    for (const badKey of ['', 'a'.repeat(63), 'z'.repeat(64)]) assert.throws(() => createNativeOwnerAdmission({ ...f.options, key: badKey }), error => error instanceof ChatStoreError && error.code === 'unavailable');
});
