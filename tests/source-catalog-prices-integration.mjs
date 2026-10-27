import assert from "node:assert/strict";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
assert.match(origin, /^http:\/\/localhost:\d+$/, "Local development only");
async function catalog(query) {
  const response = await fetch(`${origin}/api/catalog?limit=48&${query}`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  return response.json();
}

const all = await catalog("");
const imported = all.items.filter(item => item.document.sourceObservation);
assert.equal(imported.length, 42);
const expected = imported.filter(item => item.variants.some(variant => variant.effectivePricePaise >= 10000 && variant.effectivePricePaise <= 50000));
assert(expected.length > 0 && expected.length < imported.length);
const filtered = await catalog("min=100&max=500&sort=price_asc");
assert.deepEqual(filtered.items.filter(item => item.document.sourceObservation).map(item => item.id).sort(), expected.map(item => item.id).sort());
for (const [sort, direction] of [["price_asc", 1], ["price_desc", -1]]) {
  const result = await catalog(`sort=${sort}`);
  const amounts = result.items.map(item => Math.min(...item.variants.map(variant => variant.effectivePricePaise)));
  for (let index = 1; index < amounts.length; index++) assert((amounts[index] - amounts[index - 1]) * direction >= 0);
}
for (const availability of ["available", "unavailable"]) {
  const result = await catalog(`availability=${availability}`);
  assert(result.items.every(item => !item.document.sourceObservation), "Unknown stock must not be inferred from a price");
}
console.log("Captured numeric catalog price filters/sorts and unknown-stock separation passed; read-only checks.");
