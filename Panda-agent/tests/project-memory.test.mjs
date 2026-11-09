import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMemoryChange, parseMemoryState } from '../src/guide/project-memory.ts';
import { createProjectMemoryHandler } from '../src/server/project-memory-handler.ts';

const thread = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const input = { requestId, expectedVersion: 0, intent: { goal: 'Draft project', board: 'Fixture board', components: [] } };
const memory = { version: 1, guideTurns: 8, compactions: 1, intent: input.intent, questions: [], recentGoals: [] };
const state = { memory, lastRequestId: requestId };
const actor = { subject: 'fixture-owner', sessionId: 'fixture-session', client: {} };
const url = 'http://localhost:3001/api/panda-agent/chats/' + thread + '/memory';
function fixture(options = {}) {
  const calls = [];
  const handler = createProjectMemoryHandler({
    enabled: () => options.enabled !== false,
    authenticate: async () => options.anonymous ? null : actor,
    current: async captured => {
      assert.equal(captured, actor);
      return !options.revoked || !calls.includes('change');
    },
    store: captured => {
      assert.equal(captured, actor);
      return {
        read: async id => { assert.equal(id, thread); calls.push('read'); return options.value ?? state; },
        change: async (id, value) => { assert.equal(id, thread); calls.push('change'); calls.push(value); return state; },
      };
    },
  });
  return { calls, handler };
}
const patch = (value = input, headers = {}) => new Request(url, {
  method: 'PATCH', headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(value),
});

test('memory corrections reuse bounded guide intent and clearing retains the monotonic version', () => {
  assert.deepEqual(parseMemoryChange({ ...input, intent: { ...input.intent, goal: '  Draft project  ' } }), input);
  assert.deepEqual(parseMemoryChange({ ...input, intent: null }), { requestId, expectedVersion: 0, intent: null });
  assert.deepEqual(parseMemoryState({ memory: { ...memory, version: 2, intent: null }, lastRequestId: requestId }).memory.intent, null);
  for (const value of [
    { ...input, expectedVersion: -1 }, { ...input, expectedVersion: 999999999 }, { ...input, subject: 'other' },
    { ...input, intent: { ...input.intent, expectedVersion: 1 } },
    { ...input, intent: { ...input.intent, components: Array(9).fill('part') } },
    { ...input, intent: { ...input.intent, board: '\ud800' } },
  ]) assert.equal(parseMemoryChange(value), null);
  assert.equal(parseMemoryState({ memory: null, lastRequestId: requestId }), null);
  assert.equal(parseMemoryState({ memory: { ...memory, intent: { ...input.intent, goal: ' padded ' } }, lastRequestId: requestId }), null);
});

test('reads and corrections use the captured owner and release only validated private state', async () => {
  const f = fixture();
  const read = await f.handler(new Request(url), thread);
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await read.json(), state);
  const changed = await f.handler(patch(), thread);
  assert.equal(changed.status, 200);
  assert.equal(f.calls.filter(c => c === 'change').length, 1);
  assert.deepEqual(f.calls.at(-1), input);
});

test('anonymous, disabled, forged origins and invalid bodies never call the memory store', async () => {
  for (const [options, request, expected] of [
    [{ anonymous: true }, patch(), 401],
    [{ enabled: false }, patch(), 503],
    [{}, patch(input, { Origin: 'https://example.invalid' }), 403],
    [{}, patch({ ...input, expectedVersion: '0' }), 400],
    [{}, patch({ ...input, owner: 'other' }), 400],
    [{}, patch({ ...input, intent: { ...input.intent, goal: 'a'.repeat(9000) } }), 400],
    [{}, new Request(url + '?subject=other'), 400],
    [{}, new Request(url, {
      method: 'PATCH', headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' },
      body: JSON.stringify(input).replace('"expectedVersion":0', '"expectedVersion":1,"expectedVersion":0'),
    }), 400],
  ]) {
    const f = fixture(options);
    const response = await f.handler(request, thread);
    assert.equal(response.status, expected);
    assert.equal(f.calls.length, 0);
  }
});

test('revoked sessions after a mutation receive no state and malformed store data stays private', async () => {
  const revoked = fixture({ revoked: true });
  const response = await revoked.handler(patch(), thread);
  assert.equal(response.status, 401);
  assert.equal(revoked.calls.filter(c => c === 'change').length, 1);
  assert.deepEqual(await response.json(), { error: 'unauthenticated' });
  const bad = fixture({ value: { memory: { secret: 'private' }, lastRequestId: null } });
  const failed = await bad.handler(new Request(url), thread);
  assert.equal(failed.status, 503);
  assert.equal(JSON.stringify(await failed.json()).includes('private'), false);
});
