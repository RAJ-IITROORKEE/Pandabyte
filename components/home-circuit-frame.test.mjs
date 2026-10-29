import assert from "node:assert/strict";
import { test } from "node:test";
import { createCircuitFrameQueue } from "./home-circuit-frame.ts";

test("coalesces samples, flushes the latest and discards cancelled work", () => {
  const callbacks = new Map();
  let nextId = 0;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { callbacks.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);
  try {
    let sample = 0;
    const applied = [];
    const queue = createCircuitFrameQueue(() => applied.push(sample));
    sample = 1; queue.schedule();
    sample = 2; queue.schedule();
    assert.equal(callbacks.size, 1);
    callbacks.values().next().value();
    callbacks.clear();
    assert.deepEqual(applied, [2]);
    sample = 3; queue.schedule();
    sample = 4; queue.flush();
    assert.deepEqual(applied, [2, 4]);
    assert.equal(callbacks.size, 0);
    sample = 5; queue.schedule();
    queue.cancel();
    assert.equal(callbacks.size, 0);
    queue.flush();
    assert.deepEqual(applied, [2, 4]);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
