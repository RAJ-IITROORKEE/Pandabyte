import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogQuery, parseInrToPaise } from "../lib/catalog/query.ts";

test("catalog query accepts repeated category facets and parses INR exactly", () => {
  const result = parseCatalogQuery(new URLSearchParams(
    "q=esp32-c3&category=boards&category=kit&min=5000.05&max=100000000&availability=available&sort=price_asc&page=2&limit=24",
  ));

  assert.deepEqual(result, {
    ok: true,
    value: {
      q: "esp32-c3",
      categories: ["boards", "kit"],
      minPaise: 500005,
      maxPaise: 10_000_000_000,
      availability: "available",
      sort: "price_asc",
      page: 2,
      limit: 24,
    },
  });
  assert.equal(parseInrToPaise("0.1"), 10);
  assert.equal(parseInrToPaise("100000000.00"), 10_000_000_000);
});

test("catalog query applies defaults and canonicalizes duplicate category values", () => {
  const result = parseCatalogQuery({ category: ["SENSOR", "sensor"], q: "  " });
  assert.deepEqual(result, {
    ok: true,
    value: {
      q: "",
      categories: ["sensor"],
      minPaise: null,
      maxPaise: null,
      availability: "all",
      sort: "relevance",
      page: 1,
      limit: 12,
    },
  });
});

test("catalog query rejects unknown and duplicate non-category parameters", () => {
  const result = parseCatalogQuery(new URLSearchParams("q=one&q=two&sort=price_asc&sort=newest&debug=true"));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.fields.map(({ field, code }) => [field, code]), [
    ["debug", "unknown_field"],
    ["q", "duplicate"],
    ["sort", "duplicate"],
  ]);
});

test("catalog GET form treats empty optional price fields as no price filter", () => {
  const result = parseCatalogQuery(new URLSearchParams("q=xc6&min=&max=&availability=all&sort=relevance&limit=12&page=1"));
  assert.equal(result.ok, true);
  assert.equal(result.value.minPaise, null);
  assert.equal(result.value.maxPaise, null);
  assert.equal(result.value.q, "xc6");
  assert.equal(parseCatalogQuery(new URLSearchParams("min=&min=12")).ok, false);
  assert.equal(parseCatalogQuery({category:"a".repeat(160)}).ok, true);
  assert.equal(parseCatalogQuery({category:"a".repeat(161)}).ok, false);
});

test("catalog query rejects malformed facets, amounts and pages", () => {
  const result = parseCatalogQuery(new URLSearchParams(
    "category=&category=valid&min=1.001&max=1&availability=maybe&page=1000&limit=12",
  ));
  assert.equal(result.ok, false);
  if (result.ok) return;
  const fields = new Set(result.fields.map(({ field }) => field));
  for (const expected of ["category", "min", "availability", "page"]) assert.ok(fields.has(expected));
  assert.equal(parseInrToPaise("1e3"), null);
  assert.equal(parseInrToPaise("100000000.01"), null);
  assert.equal(parseInrToPaise("-1"), null);
  assert.equal(parseCatalogQuery(new URLSearchParams("q=%0A")).ok, false);
});

test("catalog query bounds category count, search length, page size and price order", () => {
  const tooMany = new URLSearchParams();
  for (let index = 0; index < 21; index += 1) tooMany.append("category", `part-${index}`);
  tooMany.set("q", "x".repeat(121));
  tooMany.set("limit", "49");
  tooMany.set("min", "12");
  tooMany.set("max", "11.99");
  const result = parseCatalogQuery(tooMany);
  assert.equal(result.ok, false);
  if (result.ok) return;
  const fields = new Set(result.fields.map(({ field }) => field));
  for (const expected of ["category", "q", "limit", "min"]) assert.ok(fields.has(expected));
});

test("catalog pagination never produces an offset above 10,000", () => {
  const query = (value) => parseCatalogQuery(new URLSearchParams(value)).ok;
  assert.equal(query("page=834&limit=12"), true);
  assert.equal(query("page=835&limit=12"), false);
  assert.equal(query("page=209&limit=48"), true);
  assert.equal(query("page=210&limit=48"), false);
});
