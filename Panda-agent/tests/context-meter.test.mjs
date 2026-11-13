import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextPercent, ringDash, formatUsd, meterTone } from '../src/ui/ai-elements/context-math.ts';

test('contextPercent clamps, rounds to one decimal and is null without a window', () => {
  assert.equal(contextPercent(16000, 256000), 6.3);
  assert.equal(contextPercent(300, 200), 100);
  assert.equal(contextPercent(-5, 200), 0);
  assert.equal(contextPercent(10, 0), null);
  assert.equal(contextPercent(10, undefined), null);
});

test('ringDash hides the unused part of the circle', () => {
  const full = ringDash(100, 5), half = ringDash(50, 5), none = ringDash(0, 5);
  assert.ok(Math.abs(full.circumference - 2 * Math.PI * 5) < 1e-9);
  assert.equal(full.offset, 0);
  assert.ok(Math.abs(half.offset - full.circumference / 2) < 1e-9);
  assert.equal(none.offset, none.circumference);
  assert.equal(ringDash(250, 5).offset, 0);
});

test('formatUsd shows four decimals, tiny and zero cases', () => {
  assert.equal(formatUsd(4_200_000), '$0.0042');
  assert.equal(formatUsd(10_000), '<$0.0001');
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(1_500_000_000), '$1.5000');
});

test('meterTone thresholds', () => {
  assert.equal(meterTone(69.9), 'ok');
  assert.equal(meterTone(70), 'warn');
  assert.equal(meterTone(90), 'warn');
  assert.equal(meterTone(90.1), 'full');
});
