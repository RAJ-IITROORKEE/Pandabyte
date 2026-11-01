import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuardedDictation } from '../src/ui/guarded-dictation.ts';

function fakeAdapter() {
  const sessions = [];
  return {
    sessions,
    listen() {
      const session = {
        status: { type: 'running' }, cancelled: 0,
        callbacks: {},
        cancel() { this.cancelled++; },
        async stop() {},
        onSpeechStart(callback) { this.callbacks.start = callback; return () => {}; },
        onSpeechEnd(callback) { this.callbacks.end = callback; return () => {}; },
        onSpeech(callback) { this.callbacks.speech = callback; return () => {}; },
      };
      sessions.push(session);
      return session;
    },
  };
}

test('cancelled dictation cannot write late speech or events into another chat', () => {
  const provider = fakeAdapter();
  const guard = createGuardedDictation(provider);
  const first = guard.adapter.listen();
  const received = [];
  first.onSpeechStart(() => received.push('start'));
  first.onSpeech(result => received.push(result.transcript));
  first.onSpeechEnd(() => received.push('end'));
  provider.sessions[0].callbacks.speech({ transcript: 'first' });
  guard.cancel();
  guard.cancel();
  assert.equal(provider.sessions[0].cancelled, 1);
  assert.deepEqual(first.status, { type: 'ended', reason: 'cancelled' });
  provider.sessions[0].callbacks.start();
  provider.sessions[0].callbacks.speech({ transcript: 'late' });
  provider.sessions[0].callbacks.end({ transcript: 'late' });
  assert.deepEqual(received, ['first']);
  const second = guard.adapter.listen();
  second.onSpeech(result => received.push(result.transcript));
  provider.sessions[1].callbacks.speech({ transcript: 'second' });
  assert.deepEqual(received, ['first', 'second']);
});

test('starting a replacement cancels the previous session and ignores its callbacks', () => {
  const provider = fakeAdapter();
  const guard = createGuardedDictation(provider);
  const first = guard.adapter.listen();
  const received = [];
  first.onSpeech(result => received.push(result.transcript));
  const second = guard.adapter.listen();
  second.onSpeech(result => received.push(result.transcript));
  assert.equal(provider.sessions[0].cancelled, 1);
  assert.equal(first.status.type, 'ended');
  provider.sessions[0].callbacks.speech({ transcript: 'stale' });
  provider.sessions[1].callbacks.speech({ transcript: 'current' });
  assert.deepEqual(received, ['current']);
});
