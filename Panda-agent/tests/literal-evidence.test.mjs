import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLiteralEvidence } from '../src/control-room/literal-evidence.ts';
import { validatePlaygroundEvaluation } from '../src/control-room/playground-evaluation.ts';

const evaluation = quote => ({ answer: 'The board uses ESP32-C3.', evidence: [{ rank: 1, quote, reason: 'The source names the processor.' }] });
const reconcile = (quote, text) => reconcileLiteralEvidence(evaluation(quote), [{ rank: 1, text }]);
const validate = (value, text) => validatePlaygroundEvaluation(value, [{ handle: '1', text }]);

test('NBSP, newlines and repeated spaces become the exact original source substring', () => {
  for (const text of ['prefix ESP32-C3\u00a0processor suffix', 'prefix ESP32-C3\r\nprocessor suffix', 'prefix ESP32-C3    processor suffix']) {
    const value = reconcile('  ESP32-C3 processor \n', text);
    assert.equal(value.evidence[0].quote, text.slice(7, -7));
    assert.ok(validate(value, text));
  }
});

test('an already literal quote stays exact even when its normalized text appears twice', () => {
  const value = evaluation('ESP32-C3\nprocessor');
  assert.equal(reconcileLiteralEvidence(value, [{ rank: 1, text: 'ESP32-C3\nprocessor; ESP32-C3 processor' }]), value);
});

test('changed words, numbers, punctuation, case, soft hyphens and Unicode forms remain rejected', () => {
  const source = 'ESP32-C3\u00a0processor, 160 MHz; cafe\u0301';
  for (const quote of ['ESP32-C3 controller', 'processor, 180 MHz', 'ESP32-C3 processor: 160 MHz', 'esp32-c3 processor', 'ESP32-\u00adC3 processor', 'caf\u00e9']) {
    const before = evaluation(quote);
    const result = reconcileLiteralEvidence(before, [{ rank: 1, text: source }]);
    assert.equal(result, before);
    assert.equal(validate(result, source), null);
  }
});

test('ambiguous normalized occurrences, including overlapping ones, are not reconciled', () => {
  for (const [quote, text] of [['ESP32-C3 processor', 'ESP32-C3\nprocessor; ESP32-C3\u00a0processor'], ['a a', 'a\na\na']]) {
    const before = evaluation(quote);
    assert.equal(reconcileLiteralEvidence(before, [{ rank: 1, text }]), before);
    assert.equal(validate(before, text), null);
  }
});

test('original source and quote bounds and recovered substring bounds are enforced', () => {
  for (const [quote, text] of [
    ['x y', 'x\ny' + 'z'.repeat(11998)],
    [' '.repeat(600) + 'x', 'x'],
    ['x y', 'x' + ' '.repeat(599) + 'y'],
  ]) {
    const before = evaluation(quote);
    assert.equal(reconcileLiteralEvidence(before, [{ rank: 1, text }]), before);
  }
  const source = 'x' + ' '.repeat(598) + 'y';
  assert.equal(reconcile('x y', source).evidence[0].quote.length, 600);
  const maximumSource = 'x\ny' + 'z'.repeat(11997);
  assert.equal(reconcile('x y', maximumSource).evidence[0].quote, 'x\ny');
});

test('malformed input, empty quotes, invalid ranks and missing passages remain unchanged', () => {
  const values = [null, [], 'answer', {}, { evidence: null }, { evidence: [] }, { answer: 'x', evidence: Array.from({ length: 5 }, () => ({ rank: 1, quote: 'x y', reason: 'source' })) },
    ...[null, [], {}, { rank: 1, quote: null }, { rank: 1, quote: ' ' }, { rank: 0, quote: 'x y' }, { rank: 1.5, quote: 'x y' }, { rank: '1', quote: 'x y' }, { rank: 2, quote: 'x y' }].map(entry => ({ answer: 'x', evidence: [entry] })),
  ];
  for (const value of values) assert.equal(reconcileLiteralEvidence(value, [{ rank: 1, text: 'x\ny' }]), value);
  const before = evaluation('x y');
  assert.equal(reconcileLiteralEvidence(before, []), before);
  assert.equal(reconcileLiteralEvidence(before, [{ rank: 2, text: 'x\ny' }]), before);
});

test('unknown keys, rank, answer and reason survive for the strict validator', () => {
  const value = { ...evaluation('x y'), extra: 'keep', evidence: [{ rank: 1, quote: 'x y', reason: 'unchanged', extra: 'also keep' }] };
  const result = reconcileLiteralEvidence(value, [{ rank: 1, text: 'x\ny' }]);
  assert.deepEqual(result, { ...value, evidence: [{ ...value.evidence[0], quote: 'x\ny' }] });
  assert.equal(validate(result, 'x\ny'), null);
  const duplicate = { answer: 'x', evidence: [evaluation('x y').evidence[0], evaluation('x y').evidence[0]] };
  assert.equal(validate(reconcileLiteralEvidence(duplicate, [{ rank: 1, text: 'x\ny' }]), 'x\ny'), null);
  const malformedReason = { answer: 'x', evidence: [{ rank: 1, quote: 'x y', reason: null }] };
  assert.equal(validate(reconcileLiteralEvidence(malformedReason, [{ rank: 1, text: 'x\ny' }]), 'x\ny'), null);
});

test('only the referenced valid rank is reconciled', () => {
  const value = { answer: 'x', evidence: [{ rank: 2, quote: 'x y', reason: 'source' }] };
  const result = reconcileLiteralEvidence(value, [{ rank: 1, text: 'unrelated' }, { rank: 2, text: 'x\ny' }]);
  assert.deepEqual(result, { ...value, evidence: [{ ...value.evidence[0], quote: 'x\ny' }] });
});

test('offset mapping uses UTF-16 positions through astral characters', () => {
  const source = 'before \u{1f43c} ESP32-C3\n\u{1f680} processor after';
  const result = reconcile('\u{1f43c} ESP32-C3 \u{1f680} processor', source);
  assert.equal(result.evidence[0].quote, '\u{1f43c} ESP32-C3\n\u{1f680} processor');
  assert.ok(validate(result, source));
});

test('reconciliation never mutates frozen evaluation or passages', () => {
  const entry = Object.freeze({ rank: 1, quote: 'x y', reason: 'source' });
  const value = Object.freeze({ answer: 'x', evidence: Object.freeze([entry]) });
  const passages = Object.freeze([Object.freeze({ rank: 1, text: 'x\ny' })]);
  const result = reconcileLiteralEvidence(value, passages);
  assert.equal(result.evidence[0].quote, 'x\ny');
  assert.equal(value.evidence[0].quote, 'x y');
  assert.notEqual(result, value);
});
