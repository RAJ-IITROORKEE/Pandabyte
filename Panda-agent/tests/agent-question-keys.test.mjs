import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionForKey, focusForKey, foldedText, askedText } from '../src/ui/agent/question-keys.ts';

test('digit keys map to a zero-based option index within range', () => {
  assert.equal(optionForKey('1', 3), 0);
  assert.equal(optionForKey('3', 3), 2);
  assert.equal(optionForKey('4', 3), null);
  assert.equal(optionForKey('9', 9), 8);
});

test('non-digit, zero and multi-character keys select nothing', () => {
  for (const key of ['0', 'a', 'Enter', '10', '', ' ']) assert.equal(optionForKey(key, 9), null);
});

test('arrow, Home and End keys rove focus and wrap', () => {
  assert.equal(focusForKey('ArrowDown', 2, 3), 0);
  assert.equal(focusForKey('ArrowUp', 0, 3), 2);
  assert.equal(focusForKey('Home', 2, 3), 0);
  assert.equal(focusForKey('End', 0, 3), 2);
  assert.equal(focusForKey('x', 0, 3), null);
  assert.equal(focusForKey('ArrowDown', 0, 0), null);
});

test('folded and asked-line text', () => {
  assert.equal(foldedText(1), '1 question waiting');
  assert.equal(foldedText(2), '2 questions waiting');
  assert.equal(askedText('Which list?', 'waiting'), 'Asked: Which list? · waiting');
  assert.equal(askedText('Which list?', 'answered'), 'Asked: Which list? · answered below');
  assert.ok(askedText('x'.repeat(100), 'waiting').startsWith(`Asked: ${'x'.repeat(59)}… ·`));
});
