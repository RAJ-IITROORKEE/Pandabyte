import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptGuard, completedAttempt } from '../src/ui/cancel-attempt.ts';

test('cancel invalidates late original callbacks without invalidating the next attempt', () => {
  const guard = createAttemptGuard();
  const first = guard.begin('thread-a', 'request-a');
  assert.equal(guard.current(first), true);
  guard.invalidate();
  assert.equal(guard.current(first), false);
  const second = guard.begin('thread-a', 'request-b');
  assert.equal(guard.current(first), false);
  assert.equal(guard.current(second), true);
  assert.deepEqual(second, { threadId: 'thread-a', requestId: 'request-b', epoch: 2 });
});

test('only the queried current attempt with authoritative complete status clears uncertainty', () => {
  const current = { threadId: 'chat', requestId: 'request', epoch: 1 };
  assert.equal(completedAttempt(current, current, 'complete'), true);
  for (const status of ['pending', 'absent', 'idle', undefined]) assert.equal(completedAttempt(current, current, status), false);
  assert.equal(completedAttempt(current, { ...current, requestId: 'other' }, 'complete'), false);
  assert.equal(completedAttempt(current, { ...current, epoch: 2 }, 'complete'), false);
  assert.equal(completedAttempt(null, current, 'complete'), false);
});
