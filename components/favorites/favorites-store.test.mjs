import test from "node:test";
import assert from "node:assert/strict";
import { parseFavorites, mergeFavoriteIds } from "./favorites-store.ts";

const item = { productId: "12345678-1234-1234-1234-123456789abc", slug: "example-board", title: "Example board" };
test("favorites reject malformed, duplicate, and oversized saved data", () => {
  assert.deepEqual(parseFavorites(JSON.stringify([item])), [item]);
  assert.equal(parseFavorites(JSON.stringify([item, item])), null);
  assert.equal(parseFavorites(JSON.stringify([{ ...item, slug: "../bad" }])), null);
  assert.equal(parseFavorites("x".repeat(20001)), null);
  assert.equal(parseFavorites(JSON.stringify(Array(51).fill(item))), null);
});

test("account merge preserves account IDs, deduplicates and rejects overflow", () => {
  const first = { ...item, productId: "123e4567-e89b-42d3-a456-426614174000" };
  const second = { ...item, productId: "123e4567-e89b-42d3-a456-426614174001" };
  assert.deepEqual(mergeFavoriteIds([first], [{ ...first, productId: first.productId.toUpperCase() }, second]), [first.productId, second.productId]);
  assert.equal(mergeFavoriteIds(Array.from({ length: 50 }, (_, i) => ({ productId: String(i) })), [first]), null);
});
