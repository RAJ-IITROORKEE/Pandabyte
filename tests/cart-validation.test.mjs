import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCartItems,
  parseCartQuote,
  parseCartQuoteRequest,
  parseCartReplaceRequest,
  parseCustomerCart,
} from "../lib/cart/validation.ts";

const variantA = "a1000000-0000-4000-8000-000000000001";
const variantB = "b2000000-0000-4000-8000-000000000002";
const variantC = "e5000000-0000-4000-8000-000000000005";
const productId = "c3000000-0000-4000-8000-000000000003";
const revisionId = "d4000000-0000-4000-8000-000000000004";

function publicVariant(id, overrides = {}) {
  return {
    id,
    sku: "PB-CART-001",
    label: "Standard",
    regularPricePaise: 100000,
    effectivePricePaise: 80000,
    isOnSale: true,
    saleEndsAt: "2026-10-30T00:00:00.000Z",
    availability: "available",
    ...overrides,
  };
}

function line(id, quantity = 1, overrides = {}) {
  const variant = publicVariant(id);
  return {
    variantId: id,
    quantity,
    productId,
    revisionId,
    slug: "test-product",
    title: "Test product",
    variant,
    lineTotalPaise: variant.effectivePricePaise * quantity,
    issue: null,
    ...overrides,
  };
}

function quote(lines) {
  const priced = lines.every((entry) => entry.lineTotalPaise !== null);
  return {
    lines,
    subtotalPaise: priced ? lines.reduce((sum, entry) => sum + (entry.lineTotalPaise ?? 0), 0) : null,
    readyForCheckout: lines.length > 0 && lines.every((entry) => entry.issue === null),
  };
}

test("cart item parser normalizes UUIDs and bounds unique quantities and line count", () => {
  assert.deepEqual(parseCartItems([
    { variantId: variantA.toUpperCase(), quantity: 2 },
    { variantId: variantB, quantity: 99 },
  ]), [
    { variantId: variantA, quantity: 2 },
    { variantId: variantB, quantity: 99 },
  ]);
  assert.deepEqual(parseCartItems([]), []);
  assert.equal(parseCartItems(Array.from({ length: 51 }, (_, i) => ({
    variantId: "a1000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    quantity: 1,
  }))), null);
  assert.equal(parseCartItems([{ variantId: variantA, quantity: 1 }, { variantId: variantA.toUpperCase(), quantity: 2 }]), null);
  for (const invalid of [
    null,
    {},
    [{ variantId: variantA, quantity: 0 }],
    [{ variantId: variantA, quantity: 100 }],
    [{ variantId: "../secret", quantity: 1 }],
    [{ variantId: variantA, quantity: 1, pricePaise: 1 }],
    [{ variantId: variantA, quantity: 1, ownerId: "customer" }],
  ]) assert.equal(parseCartItems(invalid), null);
});

test("cart request parsers enforce exact envelopes and permit the initial zero version", () => {
  assert.deepEqual(parseCartQuoteRequest({ items: [{ variantId: variantA, quantity: 1 }] }), {
    items: [{ variantId: variantA, quantity: 1 }],
  });
  assert.deepEqual(parseCartReplaceRequest({ expectedVersion: 0, items: [] }), { expectedVersion: 0, items: [] });
  assert.equal(parseCartQuoteRequest({ items: [], currency: "INR" }), null);
  assert.equal(parseCartReplaceRequest({ expectedVersion: 1, items: [], userId: "x" }), null);
  assert.equal(parseCartReplaceRequest({ expectedVersion: -1, items: [] }), null);
  assert.equal(parseCartReplaceRequest({ expectedVersion: 1.5, items: [] }), null);
});

test("quote parser checks current prices, calculated totals, and empty quote semantics", () => {
  const valid = quote([line(variantA, 2), line(variantB, 1)]);
  assert.deepEqual(parseCartQuote(valid), valid);
  assert.deepEqual(parseCartQuote(quote([])), { lines: [], subtotalPaise: 0, readyForCheckout: false });

  const wrongTotal = structuredClone(valid);
  wrongTotal.lines[0].lineTotalPaise += 1;
  assert.equal(parseCartQuote(wrongTotal), null);
  const wrongSubtotal = structuredClone(valid);
  wrongSubtotal.subtotalPaise += 1;
  assert.equal(parseCartQuote(wrongSubtotal), null);
  const wrongReady = structuredClone(valid);
  wrongReady.readyForCheckout = false;
  assert.equal(parseCartQuote(wrongReady), null);
});

test("quote parser accepts safe unavailable states and computes subtotal only when all prices are known", () => {
  const unknown = {
    variantId: variantC,
    quantity: 1,
    productId: null,
    revisionId: null,
    slug: null,
    title: null,
    variant: null,
    lineTotalPaise: null,
    issue: "not_available",
  };
  const unpricedVariant = publicVariant(variantB, {
    regularPricePaise: null,
    effectivePricePaise: null,
    isOnSale: false,
    saleEndsAt: null,
  });
  const unpriced = line(variantB, 3, {
    variant: unpricedVariant,
    lineTotalPaise: null,
    issue: "price_unavailable",
  });
  const shortageVariant = publicVariant(variantA, { availability: "unavailable" });
  const pricedButShort = line(variantA, 4, {
    variant: shortageVariant,
    lineTotalPaise: 320000,
    issue: "quantity_unavailable",
  });
  const partial = quote([unknown, unpriced, pricedButShort]);
  assert.equal(partial.subtotalPaise, null);
  assert.equal(partial.readyForCheckout, false);
  assert.deepEqual(parseCartQuote(partial), partial);

  const mismatch = structuredClone(partial);
  mismatch.lines[1].title = null;
  assert.equal(parseCartQuote(mismatch), null);
  const unexpectedField = structuredClone(partial);
  unexpectedField.lines[1].variant.privateStock = 23;
  assert.equal(parseCartQuote(unexpectedField), null);
});

test("customer cart validates item/quote coherence independent of quote ordering", () => {
  const items = [{ variantId: variantA, quantity: 2 }, { variantId: variantB, quantity: 1 }];
  const value = { version: 4, items, quote: quote([line(variantB), line(variantA, 2)]) };
  assert.deepEqual(parseCustomerCart(value), value);
  assert.deepEqual(parseCustomerCart({ version: 0, items: [], quote: quote([]) }), {
    version: 0,
    items: [],
    quote: { lines: [], subtotalPaise: 0, readyForCheckout: false },
  });

  assert.equal(parseCustomerCart({ ...value, version: 0 }), null);
  assert.equal(parseCustomerCart({ ...value, items: [{ ...items[0], quantity: 1 }, items[1]] }), null);
  assert.equal(parseCustomerCart({ ...value, extra: "field" }), null);
  assert.equal(parseCustomerCart({ ...value, quote: quote([line(variantA), line(variantA)]) }), null);
});
