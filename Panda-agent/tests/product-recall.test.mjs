import test from 'node:test';
import assert from 'node:assert/strict';
import { deliver, extractFacts, checkProduct } from '../scripts/check-product-recall.mjs';

test('extractFacts finds table rows, key-value lines and bullets only', () => {
  const t = '# Title\nSome prose here.\n| Spec | Value |\n|---|---|\n| CPU | ESP32 |\nVoltage: 5V\n- USB-C port\n* Wi-Fi';
  assert.deepEqual(extractFacts(t), ['| Spec | Value |', '| CPU | ESP32 |', 'Voltage: 5V', '- USB-C port', '* Wi-Fi']);
});

test('deliver applies the 20000 character cap, skipping a passage that does not fit', () => {
  const out = deliver(['a'.repeat(12000), 'b'.repeat(9000), 'c'.repeat(100)]);
  assert.deepEqual(out.map(s => s[0]), ['a', 'c']);
});

test('deliver caps fragments and drops duplicates and oversized chunks', () => {
  assert.equal(deliver(Array.from({ length: 30 }, (_, i) => `p${i}`)).length, 16);
  assert.deepEqual(deliver(['x', 'x', 'y'.repeat(12001)]), ['x']);
});

test('checkProduct lists facts that miss the context', () => {
  const r = checkProduct(['- first fact', '- second fact'], { fragments: 1, characters: 20000, chunkMax: 12000 });
  assert.equal(r.recalled, 1);
  assert.deepEqual(r.missed, ['- second fact']);
  assert.equal(r.fitsCaps, false);
});
