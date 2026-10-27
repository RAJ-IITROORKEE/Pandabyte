import assert from "node:assert/strict";
import test from "node:test";

import { isPagesTableItem, isPagesTableResult, parsePagesTableQuery } from "../lib/admin/pages-table-contract.ts";

test("Pages table query defaults and accepts bounded filters, sorts, limits, and offsets", () => {
  assert.deepEqual(parsePagesTableQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parsePagesTableQuery(new URLSearchParams("q=%20Help%20&status=published&sort=title_asc&limit=50&offset=10000")), {
    ok: true,
    value: { q: "Help", status: "published", sort: "title_asc", limit: 50, offset: 10000 },
  });
  for (const status of ["all", "draft", "published", "archived"]) assert.equal(parsePagesTableQuery(new URLSearchParams(`status=${status}`)).ok, true);
  for (const sort of ["updated_desc", "updated_asc", "title_asc", "title_desc"]) assert.equal(parsePagesTableQuery(new URLSearchParams(`sort=${sort}`)).ok, true);
  for (const limit of ["10", "20", "50"]) assert.equal(parsePagesTableQuery(new URLSearchParams(`limit=${limit}`)).ok, true);
});

test("Pages table query rejects unknown, duplicate, malformed, and unbounded values", () => {
  for (const query of [
    "extra=1", "q=a&q=b", "status=visible", "sort=random", "limit=15", "offset=-1", "offset=10001", "offset=01",
    `q=${"a".repeat(121)}`, "q=%00",
  ]) assert.equal(parsePagesTableQuery(new URLSearchParams(query)).ok, false, query);
});

test("Pages table result matches the generic record-list DTO and rejects malformed rows", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "page", title: "Help", slug: "help", version: 2,
    publishedRevisionId: null, archived: false, updatedAt: "2026-10-27T00:00:00.000Z",
  };
  assert.equal(isPagesTableItem(item), true);
  assert.equal(isPagesTableResult({ items: [item], total: 1 }, 10), true);
  for (const invalid of [
    { ...item, id: "bad" }, { ...item, kind: "blog" }, { ...item, title: "" }, { ...item, version: 0 },
    { ...item, publishedRevisionId: "bad" }, { ...item, archived: 1 }, { ...item, updatedAt: "yesterday" },
    { ...item, extra: true },
  ]) assert.equal(isPagesTableItem(invalid), false);
  assert.equal(isPagesTableResult({ items: [item], total: 0 }, 10), false);
  assert.equal(isPagesTableResult({ items: [item, item], total: 2 }, 1), false);
});
