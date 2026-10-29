import assert from "node:assert/strict";
import test from "node:test";
import { parseHistoryOffset, parseInventoryHistory } from "../lib/admin/inventory-history-contract.ts";

const item = { operation: "initialize", delta: 0, balanceAfter: 0, reason: "Initial count", occurredAt: "2026-10-28T00:00:00Z" };
test("history accepts bounded pages and initialization counts", () => {
  assert.equal(parseHistoryOffset(new URLSearchParams()), 0);
  assert.equal(parseHistoryOffset(new URLSearchParams("offset=20")), 20);
  for (const query of ["offset=-1", "offset=1", "offset=10020", "offset=01", "offset=0&offset=20", "limit=20"]) assert.equal(parseHistoryOffset(new URLSearchParams(query)), null);
  const parsed = parseInventoryHistory({ items: [item], offset: 0, hasMore: false }, 0);
  assert.equal(parsed.items[0].delta, 0);
  assert.equal(parsed.items[0].occurredAt, "2026-10-28T00:00:00.000Z");
  assert.ok(parseInventoryHistory({ items: [{ ...item, delta: -2 }, { ...item, occurredAt: "2026-10-29T00:00:00Z" }], offset: 20, hasMore: false }, 20));
});
test("history rejects private fields, malformed data and inconsistent pages", () => {
  const valid = { items: [item], offset: 0, hasMore: false };
  for (const bad of [
    { ...valid, items: [{ ...item, actor: "subject" }] },
    { ...valid, items: [{ ...item, operation: "other" }] },
    { ...valid, items: [{ ...item, balanceAfter: -1 }] },
    { ...valid, items: [{ ...item, occurredAt: "bad" }] },
    { ...valid, hasMore: true }, { ...valid, offset: 20 },
  ]) assert.equal(parseInventoryHistory(bad, 0), null);
  assert.equal(parseInventoryHistory({ items: Array(20).fill(item), offset: 0, hasMore: true }, 0).items.length, 20);
});
