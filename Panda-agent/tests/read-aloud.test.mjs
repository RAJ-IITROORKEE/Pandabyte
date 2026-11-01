import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadAloud } from '../src/ui/read-aloud.ts';

test('read aloud replaces and stops speech without stale completion changing state', () => {
  const utterances = [], states = [];
  let cancellations = 0;
  const controller = createReadAloud({ speak: utterance => utterances.push(utterance), cancel: () => cancellations++ }, text => ({ text }), id => states.push(id));
  controller.play('one', 'First answer');
  controller.play('two', 'Second answer');
  assert.equal(cancellations, 1);
  utterances[0].onend();
  assert.equal(states.at(-1), 'two');
  utterances[1].onend();
  assert.equal(states.at(-1), null);
  controller.play('three', 'Third answer');
  controller.stop();
  utterances[2].onerror();
  assert.equal(states.at(-1), null);
  assert.equal(cancellations, 2);
});

test('a speech failure clears the active state', () => {
  const states = [];
  const controller = createReadAloud({ speak() { throw new Error('unavailable'); }, cancel() {} }, text => ({ text }), id => states.push(id));
  controller.play('one', 'Answer');
  assert.equal(states.at(-1), null);
});
