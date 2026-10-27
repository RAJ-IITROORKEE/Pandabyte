import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseCartQuote } from "../lib/cart/validation.ts";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
assert.match(origin, /^http:\/\/localhost:\d+$/, "Local development only");

async function read(route, options = {}) {
  const response = await fetch(`${origin}${route}`, { ...options, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  return { response, data };
}

async function quote(items) {
  return read("/api/cart/quote", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ items }),
  });
}

const catalog = await read("/api/catalog?limit=48");
assert.equal(catalog.response.status, 200);
const imported = catalog.data.items.filter(item => item.document.sourceObservation);
assert.equal(imported.length, 42);
for (const item of imported) {
  assert.equal(item.variants.length, 1);
  const variant = item.variants[0];
  assert.equal(variant.cartEligible, true);
  assert.equal(variant.purchasable, false);
  assert.equal(variant.availability, "unavailable");
  assert(Number.isSafeInteger(variant.effectivePricePaise));
  assert(variant.effectivePricePaise >= 0 && variant.effectivePricePaise <= variant.regularPricePaise);
  assert(!("sourceReview" in item.document));
  assert(!("stock" in variant) && !("availableQuantity" in variant));
}
for (const item of [imported[0], imported.find(item => item.variants[0].isOnSale)].filter(Boolean)) {
  const detail = await read(`/api/published/products/${encodeURIComponent(item.slug)}`);
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.data.record.variants, item.variants);
}
const items = imported.map(item => ({ variantId: item.variants[0].id, quantity: 2 }));
const quoted = await quote(items);
assert.equal(quoted.response.status, 200);
assert.match(quoted.response.headers.get("cache-control"), /no-store/);
assert(parseCartQuote(quoted.data));
assert.equal(quoted.data.readyForCheckout, false);
assert.equal(quoted.data.subtotalPaise, imported.reduce((sum, item) => sum + item.variants[0].effectivePricePaise * 2, 0));
for (const line of quoted.data.lines) {
  assert.equal(line.variant.cartEligible, true);
  assert.equal(line.variant.availability, "unavailable");
  assert.equal(line.issue, "quantity_unavailable");
}
const highQuantity = await quote([{ ...items[0], quantity: 99 }]);
assert.equal(highQuantity.response.status, 200);
assert.equal(highQuantity.data.subtotalPaise, imported[0].variants[0].effectivePricePaise * 99);
const unknown = await quote([{ variantId: randomUUID(), quantity: 1 }]);
assert.equal(unknown.response.status, 200);
assert.equal(unknown.data.lines[0].issue, "not_available");
assert.equal(unknown.data.lines[0].title, null);
assert.equal(unknown.data.subtotalPaise, null);
for (const invalid of [[{ ...items[0], pricePaise: 1 }], [{ ...items[0], cartEligible: true }], [{ ...items[0], quantity: 100 }]]) {
  assert.equal((await quote(invalid)).response.status, 400);
}
const privateCart = await read("/api/cart");
assert.equal(privateCart.response.status, 401);
console.log("42 source products: numeric price quotes, quantity bounds, tamper rejection and private cart access passed; no cart mutation performed.");
