import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_INVENTORY_SORTS, ADMIN_INVENTORY_STOCK_FILTERS, parseAdminInventoryQuery } from "../lib/admin/inventory-contract.ts";

test("inventory query defaults and bounded filters, sorts, and paging", () => {
  assert.deepEqual(parseAdminInventoryQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", stock: "all", sort: "updated_desc", limit: 24, offset: 0, category: null },
  });
  assert.deepEqual(parseAdminInventoryQuery(new URLSearchParams("q=%20SKU-42%20&stock=in_stock&sort=stock_desc&limit=100&offset=10000")), {
    ok: true,
    value: { q: "SKU-42", stock: "in_stock", sort: "stock_desc", limit: 100, offset: 10000, category: null },
  });
  for (const stock of ADMIN_INVENTORY_STOCK_FILTERS) assert.equal(parseAdminInventoryQuery(new URLSearchParams(`stock=${stock}`)).ok, true);
  for (const sort of ADMIN_INVENTORY_SORTS) assert.equal(parseAdminInventoryQuery(new URLSearchParams(`sort=${sort}`)).ok, true);
  assert.equal(parseAdminInventoryQuery(new URLSearchParams(`q=${"x".repeat(120)}&limit=1`)).ok, true);
  const category = "a1234567-1234-4234-8234-123456789abc";
  assert.equal(parseAdminInventoryQuery(new URLSearchParams({ category })).value.category, category);
});

test("inventory query rejects unknown, duplicate, malformed, and out-of-range values", () => {
  for (const query of [
    "category=bad", "category=one&category=two", "debug=1", "status=published", "q=a&q=b", "stock=available", "sort=price_asc", "limit=0", "limit=101", "limit=01",
    "offset=-1", "offset=10001", "offset=01", `q=${"x".repeat(121)}`, `q=${" ".repeat(121)}`, "q=%00",
  ]) assert.equal(parseAdminInventoryQuery(new URLSearchParams(query)).ok, false, query);
});
