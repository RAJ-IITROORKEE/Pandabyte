import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readActiveChat, writeActiveChat, clearActiveChat } from '../src/ui/active-chat.ts';

test('per-user pointers accept only UUIDs and tolerate denied storage', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const id = '12345678-1234-4123-8123-123456789abc';
  writeActiveChat(storage, 'user-a', id);
  assert.equal(readActiveChat(storage, 'user-a'), id);
  assert.equal(readActiveChat(storage, 'user-b'), null);
  writeActiveChat(storage, 'user-a', 'not-a-uuid');
  assert.equal(readActiveChat(storage, 'user-a'), id);
  values.set('panda-agent:active-chat:user-a', 'bad');
  assert.equal(readActiveChat(storage, 'user-a'), null);
  writeActiveChat(storage, 'user-a', id);
  clearActiveChat(storage, 'user-a');
  assert.equal(readActiveChat(storage, 'user-a'), null);
  const denied = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  assert.equal(readActiveChat(denied, 'user-a'), null);
  assert.doesNotThrow(() => writeActiveChat(denied, 'user-a', id));
  assert.doesNotThrow(() => clearActiveChat(denied, 'user-a'));
});
