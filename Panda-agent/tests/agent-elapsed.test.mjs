import assert from "node:assert/strict";
import test from "node:test";
import { formatElapsed, panelSummary, stepDurations } from "../src/ui/agent/elapsed.ts";

test("formatElapsed", () => {
  assert.equal(formatElapsed(0), "0s");
  assert.equal(formatElapsed(4999), "4s");
  assert.equal(formatElapsed(59999), "59s");
  assert.equal(formatElapsed(65000), "1m 5s");
  assert.equal(formatElapsed(-5), "0s");
  assert.equal(formatElapsed(Number.NaN), "0s");
});

test("panelSummary", () => {
  assert.equal(panelSummary({ busy: true, complete: false, elapsedMs: 4000 }), "Thinking · 4s");
  assert.equal(panelSummary({ busy: false, complete: true, elapsedMs: 4000 }), "Worked for 4s");
  assert.equal(panelSummary({ busy: false, complete: false, elapsedMs: 4000 }), "Stopped after 4s");
});

test("stepDurations", () => {
  assert.deepEqual(stepDurations([1000, 3000, 4500], 9000), [2000, 1500, 4500]);
  assert.deepEqual(stepDurations([1000, 3000], null), [2000, null]);
  assert.deepEqual(stepDurations(undefined, 5), []);
  assert.deepEqual(stepDurations([5000], 1000), [null]);
});
