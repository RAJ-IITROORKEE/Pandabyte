import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CATEGORY_TABLE_QUERY,
  parseCategoryTableQuery,
  serializeCategoryTableQuery,
} from "./categories-table-query.ts";

test("category table query parses supported filters and serializes them in stable order", () => {
  const query = parseCategoryTableQuery("?q=%20xC6%20&status=published&sort=products_desc&limit=50&offset=100");

  assert.deepEqual(query, { q: "xC6", status: "published", sort: "products_desc", limit: 50, offset: 100 });
  assert.equal(serializeCategoryTableQuery(query), "q=xC6&status=published&sort=products_desc&limit=50&offset=100");
});

test("category table query rejects unsupported values and offsets outside the API bound", () => {
  assert.deepEqual(parseCategoryTableQuery("?q=%20%20&status=visible&sort=random&limit=15&offset=10001"), DEFAULT_CATEGORY_TABLE_QUERY);
  assert.equal(parseCategoryTableQuery("?offset=-1").offset, 0);
  assert.equal(parseCategoryTableQuery("?offset=10000").offset, 10000);
  assert.equal(parseCategoryTableQuery(`?q=${"x".repeat(121)}`).q, "");
  assert.equal(parseCategoryTableQuery("?q=bad%00value").q, "");
});

test("category table query writes defaults while omitting an empty search", () => {
  assert.equal(serializeCategoryTableQuery(DEFAULT_CATEGORY_TABLE_QUERY), "status=all&sort=updated_desc&limit=20&offset=0");
  assert.equal(serializeCategoryTableQuery({ ...DEFAULT_CATEGORY_TABLE_QUERY, q: "   " }).startsWith("q="), false);
});
