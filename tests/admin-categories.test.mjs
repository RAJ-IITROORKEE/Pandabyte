import assert from "node:assert/strict";
import test from "node:test";

import { isCategoryTableItem, isCategoryTableResult, parseCategoryTableQuery } from "../lib/admin/category-contract.ts";

test("category table query defaults and accepts the supported statuses, sorts, and limits", () => {
  assert.deepEqual(parseCategoryTableQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 },
  });
  const parsed = parseCategoryTableQuery(new URLSearchParams("q=%20Sensors%20&status=published&sort=products_desc&limit=50&offset=100"));
  assert.deepEqual(parsed, { ok: true, value: { q: "Sensors", status: "published", sort: "products_desc", limit: 50, offset: 100 } });
  for (const status of ["all", "draft", "published", "archived"]) {
    assert.equal(parseCategoryTableQuery(new URLSearchParams(`status=${status}`)).ok, true);
  }
  for (const sort of ["updated_desc", "updated_asc", "title_asc", "title_desc", "position_asc", "position_desc", "products_desc"]) {
    assert.equal(parseCategoryTableQuery(new URLSearchParams(`sort=${sort}`)).ok, true);
  }
  for (const limit of ["10", "20", "50"]) assert.equal(parseCategoryTableQuery(new URLSearchParams(`limit=${limit}`)).ok, true);
  assert.equal(parseCategoryTableQuery(new URLSearchParams(`q=${"a".repeat(120)}&offset=10000`)).ok, true);
});

test("category table query rejects unknown, duplicate, oversized, and malformed values", () => {
  for (const query of [
    "debug=1", "q=a&q=b", "status=visible", "sort=random", "limit=15", "offset=-1", "offset=10001", "offset=01",
    `q=${"a".repeat(121)}`, "q=%00",
  ]) assert.equal(parseCategoryTableQuery(new URLSearchParams(query)).ok, false, query);
});

test("category table DTO enforces exact fields and bounded category/parent data", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Sensors", slug: "sensors", version: 2,
    status: "published", updatedAt: "2026-10-27T00:00:00.000Z", parent: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Electronics" },
    productCount: 3, position: 4,
  };
  assert.equal(isCategoryTableItem(item), true);
  assert.equal(isCategoryTableResult({ items: [item], total: 1 }, 10), true);
  assert.equal(isCategoryTableItem({ ...item, parent: null }), true);
  for (const invalid of [
    { ...item, id: "bad" }, { ...item, title: "" }, { ...item, version: 0 }, { ...item, status: "hidden" },
    { ...item, updatedAt: "tomorrow" }, { ...item, productCount: -1 }, { ...item, position: 1.5 },
    { ...item, extra: true }, { ...item, parent: { ...item.parent, id: "bad" } }, { ...item, parent: { ...item.parent, extra: true } },
  ]) assert.equal(isCategoryTableItem(invalid), false);
  assert.equal(isCategoryTableResult({ items: [item], total: 0 }, 10), false);
  assert.equal(isCategoryTableResult({ items: [item, item], total: 2 }, 1), false);
});
