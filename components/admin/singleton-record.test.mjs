import assert from "node:assert/strict";
import test from "node:test";
import { findActiveSingleton } from "./singleton-record.ts";

test("singleton lookup skips archived records across unfiltered pages", async () => {
  const archived = Array.from({ length: 100 }, (_, i) => ({ id: String(i), archived: true }));
  const offsets = [];
  const id = await findActiveSingleton(async (offset) => {
    offsets.push(offset);
    return { items: offset ? [{ id: "active", archived: false }] : archived, total: 101 };
  });
  assert.equal(id, "active");
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(await findActiveSingleton(async () => ({ items: archived, total: 100 })), null);
});

test("singleton lookup fails closed on errors and an incomplete bounded scan", async () => {
  await assert.rejects(findActiveSingleton(async () => { throw new Error("offline"); }), /offline/);
  await assert.rejects(findActiveSingleton(async () => ({ items: [], total: 1 })), /Unable to check all records/);
  const archived = Array.from({ length: 100 }, (_, i) => ({ id: String(i), archived: true }));
  await assert.rejects(findActiveSingleton(async () => ({ items: archived, total: 20000 })), /Unable to check all records/);
});
