import assert from "node:assert/strict";
import test from "node:test";

import { isProductTableStats, parseProductPriceWrites, parseProductTableQuery } from "../lib/admin/product-contract.ts";

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
  const legacy = parseProductPriceWrites([{
    sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null,
    saleStartsAt: null, saleEndsAt: null, reason: "Legacy price",
  }]);
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal("actualPricePaise" in legacy.value[0], false);
  const actual = parseProductPriceWrites([{
    sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, actualPricePaise: 10000,
    salePricePaise: 9000, saleStartsAt: "2026-10-27T00:00:00Z", saleEndsAt: "2026-10-28T00:00:00Z", reason: "Source price pair",
  }]);
  assert.equal(actual.ok, true);
  if (actual.ok) assert.equal(actual.value[0].actualPricePaise, 10000);
  for (const invalid of [
    [{ sku: "SKU-1", expectedPriceVersion: -1, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500.5, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: 13000, saleStartsAt: "2026-10-28T00:00:00Z", saleEndsAt: "2026-10-27T00:00:00Z", reason: "Price" }],
    [
      { sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" },
      { sku: "sku-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" },
    ],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price", stock: 3 }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, actualPricePaise: null, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, actualPricePaise: 12501, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Price" }],
    [{ sku: "SKU-1", expectedPriceVersion: 0, regularPricePaise: 12500, actualPricePaise: 10000, salePricePaise: 10001, saleStartsAt: "2026-10-27T00:00:00Z", saleEndsAt: "2026-10-28T00:00:00Z", reason: "Price" }],
  ]) assert.equal(parseProductPriceWrites(invalid).ok, false);
});

test("product table summary stats enforce bounded counts and ordered paise ranges", () => {
  const stats = {
    totalProducts: 4,
    unpricedProducts: 1,
    categories: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Sensors", count: 2 }],
    prices: { minPaise: 500, avgPaise: 900, maxPaise: 1200, pricedProducts: 3 },
  };
  assert.equal(isProductTableStats(stats), true);
  assert.equal(isProductTableStats({ totalProducts: 4, unpricedProducts: 4, categories: [], prices: null }), true);
  for (const invalid of [
    { ...stats, unpricedProducts: 5 },
    { ...stats, categories: [{ ...stats.categories[0], count: 5 }] },
    { ...stats, prices: { ...stats.prices, pricedProducts: 2 } },
    { ...stats, prices: { ...stats.prices, avgPaise: 1300 } },
    { ...stats, prices: { ...stats.prices, minPaise: -1 } },
    { ...stats, prices: null },
  ]) assert.equal(isProductTableStats(invalid), false);
});
