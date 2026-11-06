import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { correlateNativeTurn } from '../src/opencode/turn-result.ts';
import { createNativeMessageID } from '../src/opencode/session-contracts.ts';

const prompt = 'Synthetic private prompt and current evidence';
const expected = { messageID: createNativeMessageID(), promptHash: createHash('sha256').update(prompt).digest('hex') };
function fixture() {
    return {
        session: { outcome: 'succeeded', time: { created: 1, updated: 40, busy: 5, idle: 40 } },
        messages: [
            { id: expected.messageID, type: 'user', text: prompt, created: 10 },
            { id: createNativeMessageID(), type: 'assistant', text: '{"outcome":"conversation","text":"Fixture answer","selections":[]}', created: 21, completed: 30, failed: false, retrying: false },
            { id: createNativeMessageID(), type: 'idle', outcome: 'succeeded', created: 40 },
        ],
    };
}
const read = value => correlateNativeTurn(expected, value.session, value.active ?? false, value.messages);

test('only the persisted prompt and a matching inactive terminal receipt release private serialized output', () => {
    const value = fixture();
    assert.deepEqual(read(value), { state: 'terminal', outcome: 'succeeded', serializedAnswer: value.messages[1].text });
    value.messages.unshift({ id: createNativeMessageID(), type: 'activity', created: 2 });
    assert.equal(read(value).state, 'terminal');
});

test('active or not-yet-terminal state never releases provisional model output', () => {
    const value = fixture(); value.active = true;
    assert.deepEqual(read(value), { state: 'pending' });
    delete value.active; delete value.session.outcome;
    assert.deepEqual(read(value), { state: 'pending' });
});

test('stale outcome, wrong prompt, extra user, missing idle and inconsistent times remain unknown', () => {
    for (const mutate of [
        f => { f.messages[0].id = createNativeMessageID(); },
        f => { f.messages[0].text = 'Different private prompt'; },
        f => { f.messages.unshift({ ...f.messages[0], id: createNativeMessageID(), created: 2 }); },
        f => { f.messages.pop(); },
        f => { f.messages[2].outcome = 'failed'; },
        f => { f.session.time.busy = 11; },
        f => { f.session.time.busy = 0; },
        f => { f.session.time.idle = 25; },
        f => { f.session.time.idle = 35; },
        f => { f.messages[1].completed = 50; },
        f => { f.messages[1].completed = undefined; },
        f => { f.session.time.busy = 20; f.messages[1].created = 11; f.messages[1].completed = 15; },
        f => { f.messages.push({ id: createNativeMessageID(), type: 'activity', created: 41 }); },
    ]) { const value = fixture(); mutate(value); assert.deepEqual(read(value), { state: 'unknown' }); }
});

test('failed, retrying, multiple or malformed successful assistants cannot become an answer', () => {
    for (const mutate of [
        f => { f.messages[1].failed = true; },
        f => { f.messages[1].retrying = true; },
        f => { f.messages.splice(2, 0, { ...f.messages[1], id: createNativeMessageID(), created: 31, completed: 32 }); },
        f => { f.messages[1].text = ''; },
        f => { f.messages[1].text = '\ud800'; },
        f => { f.messages[1].text = 'x'.repeat(24001); },
        f => { f.messages[1].id = f.messages[0].id; },
        f => { f.messages[1].created = 1; },
    ]) { const value = fixture(); mutate(value); assert.deepEqual(read(value), { state: 'unknown' }); }
});

test('failed or interrupted terminal receipts release no partial text or provider failure payload', () => {
    for (const outcome of ['failed', 'interrupted']) {
        const value = fixture(); value.session.outcome = outcome; value.messages[2].outcome = outcome;
        value.messages[1].text = 'PRIVATE PARTIAL RESPONSE'; value.messages[1].failed = true;
        assert.deepEqual(read(value), { state: 'terminal', outcome });
    }
});

test('invalid correlation identifiers and malformed native states fail closed', () => {
    const value = fixture();
    for (const identity of [{ ...expected, promptHash: 'invalid' }, { ...expected, messageID: 'foreign' }]) assert.deepEqual(correlateNativeTurn(identity, value.session, false, value.messages), { state: 'unknown' });
    assert.deepEqual(correlateNativeTurn(expected, null, false, value.messages), { state: 'unknown' });
    assert.deepEqual(correlateNativeTurn(expected, value.session, false, Array(101).fill(value.messages[0])), { state: 'unknown' });
});
