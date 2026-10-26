import assert from "node:assert/strict";
import test from "node:test";

import { parseProductPriceWrites, parseProductTableQuery } from "../lib/admin/product-contract.ts";

test("product table query accepts the bounded filter and sort contract", () => {
  const parsed = parseProductTableQuery(new URLSearchParams("q=%20xC6%20&status=published&categoryId=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA&sort=price_asc&limit=50&offset=100"));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value, {
    q: "xC6", status: "published", categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sort: "price_asc", limit: 50, offset: 100,
  });
});

test("product table query defaults and rejects duplicate, unknown, and out-of-range parameters", () => {
  const defaults = parseProductTableQuery(new URLSearchParams());
  assert.deepEqual(defaults, { ok: true, value: { q: "", status: "all", categoryId: null, sort: "updated_desc", limit: 20, offset: 0 } });
  for (const query of [
    "q=a&q=b", "debug=1", "status=visible", "categoryId=bad", "sort=random", "limit=15", "offset=-1", "offset=10001", `q=${"a".repeat(121)}`,
  ]) assert.equal(parseProductTableQuery(new URLSearchParams(query)).ok, false, query);
});

test("product price writes validate integer paise, independent versions, SKU uniqueness, and bounded sale windows", () => {
  const valid = parseProductPriceWrites([{
    sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: 10000,
    saleStartsAt: "2026-10-27T00:00:00Z", saleEndsAt: "2026-10-28T00:00:00Z", reason: "Initial price",
  }]);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.deepEqual(valid.value[0], {
    sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: 10000,
    saleStartsAt: "2026-10-27T00:00:00.000Z", saleEndsAt: "2026-10-28T00:00:00.000Z", reason: "Initial price",
  });
  for (const invalid of [
    [{ sku: "SKU-1", expectedPriceVersion: -1, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500.5, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: 13000, saleStartsAt: "2026-10-28T00:00:00Z", saleEndsAt: "2026-10-27T00:00:00Z", reason: "Price" }],
    [
      { sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" },
      { sku: "sku-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" },
    ],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price", stock: 3 }],
  ]) assert.equal(parseProductPriceWrites(invalid).ok, false);
});
