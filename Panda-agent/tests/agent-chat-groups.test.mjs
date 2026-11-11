import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupChats } from '../src/ui/agent/chat-groups.ts';

const now = new Date(2026, 10, 12, 15, 0, 0).getTime();
const at = (daysAgo, hour = 10) => ({ updatedAt: new Date(2026, 10, 12 - daysAgo, hour).toISOString(), id: `${daysAgo}-${hour}` });

test('chats fall into Today, Yesterday, 7 days, 30 days and Older, newest group first', () => {
  const groups = groupChats([at(0, 9), at(0, 1), at(1), at(3), at(20), at(90), { updatedAt: 'not a date', id: 'bad' }], now);
  assert.deepEqual(groups.map(g => g.label), ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older']);
  assert.deepEqual(groups[0].items.map(c => c.id), ['0-9', '0-1']);
  assert.deepEqual(groups[4].items.map(c => c.id), ['90-10', 'bad']);
});

test('empty groups are left out', () => {
  assert.deepEqual(groupChats([], now), []);
  assert.deepEqual(groupChats([at(0)], now).map(g => g.label), ['Today']);
});
