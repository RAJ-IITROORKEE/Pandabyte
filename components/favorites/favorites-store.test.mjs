import test from "node:test";
import assert from "node:assert/strict";
import { parseFavorites } from "./favorites-store.ts";

const item = { productId: "12345678-1234-1234-1234-123456789abc", slug: "example-board", title: "Example board" };
test("favorites reject malformed, duplicate, and oversized saved data", () => {
  assert.deepEqual(parseFavorites(JSON.stringify([item])), [item]);
  assert.equal(parseFavorites(JSON.stringify([item, item])), null);
  assert.equal(parseFavorites(JSON.stringify([{ ...item, slug: "../bad" }])), null);
  assert.equal(parseFavorites("x".repeat(20001)), null);
  assert.equal(parseFavorites(JSON.stringify(Array(51).fill(item))), null);
});
