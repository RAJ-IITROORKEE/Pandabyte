import assert from "node:assert/strict";
import test from "node:test";
import { parseTestQuote, testQuoteKey, fetchTestQuote } from "../components/cart/test-quote.ts";

const valid = { testMode: true, subtotalPaise: 200000, shippingPaise: 10000, taxPaise: 36000, totalPaise: 246000, taxRateBasisPoints: 1800, chargesAreFictional: true, policyVersion: "local-test-v1" };
test("accepts only matching, internally consistent provisional server quotes", () => {
  assert.deepEqual(parseTestQuote(valid, 200000), valid);
  for (const patch of [{ subtotalPaise: 199999 }, { totalPaise: 1 }, { taxPaise: -1 }, { shippingPaise: 0.5 }, { taxRateBasisPoints: 1700 }, { chargesAreFictional: false }, { policyVersion: "old" }, { testMode: false }]) assert.equal(parseTestQuote({ ...valid, ...patch }, 200000), null);
  assert.equal(parseTestQuote(valid, 100), null);
  assert.equal(parseTestQuote(null, 200000), null);
});
test("quote key changes with items, quantities or subtotal", () => {
  const items = [{ variantId: "a", quantity: 1 }];
  assert.notEqual(testQuoteKey(items, 100), testQuoteKey(items, 101));
  assert.notEqual(testQuoteKey(items, 100), testQuoteKey([{ variantId: "a", quantity: 2 }], 100));
  assert.notEqual(testQuoteKey(items, 100, { revision: 1 }), testQuoteKey(items, 100, { revision: 2 }));
});
test("request sends only items, rejects malformed responses, and forwards cancellation", async () => {
  const original = globalThis.fetch, controller = new AbortController(), items = [{ variantId: "a", quantity: 1 }];
  try {
    globalThis.fetch = async (_url, options) => { assert.deepEqual(JSON.parse(options.body), { items }); assert.equal(options.signal, controller.signal); return { ok: true, json: async () => valid }; };
    assert.deepEqual(await fetchTestQuote(items, 200000, controller.signal), valid);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...valid, totalPaise: 0 }) });
    await assert.rejects(fetchTestQuote(items, 200000, controller.signal));
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(fetchTestQuote(items, 200000, controller.signal));
  } finally { globalThis.fetch = original; }
});
