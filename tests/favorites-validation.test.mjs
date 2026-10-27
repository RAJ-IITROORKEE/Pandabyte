import test from "node:test";
import assert from "node:assert/strict";
import { parseFavoriteIds, parseFavorites, parseFavoritesRequest } from "../lib/favorites/validation.ts";
const id = "123e4567-e89b-42d3-a456-426614174000";
test("favorites input is bounded, unique, versioned and excludes identity", () => {
  assert.deepEqual(parseFavoritesRequest({ expectedVersion: 0, productIds: [id.toUpperCase()] }), { expectedVersion: 0, productIds: [id] });
  assert.equal(parseFavoriteIds([id, id.toUpperCase()]), null);
  assert.equal(parseFavoriteIds(Array(51).fill(id)), null);
  assert.equal(parseFavoritesRequest({ expectedVersion: 0, productIds: [], userId: "other" }), null);
  assert.equal(parseFavoritesRequest({ expectedVersion: -1, productIds: [] }), null);
});
test("favorites response accepts current and withdrawn products only", () => {
  assert.deepEqual(parseFavorites({ version: 1, items: [{ productId: id, title: null, slug: null }] }), { version: 1, items: [{ productId: id, title: null, slug: null }] });
  assert.equal(parseFavorites({ version: 1, items: [{ productId: id, title: "Old title", slug: null }] }), null);
  assert.equal(parseFavorites({ version: 0, items: [{ productId: id, title: null, slug: null }] }), null);
});
