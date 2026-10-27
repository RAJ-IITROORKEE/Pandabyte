import assert from "node:assert/strict";
import test from "node:test";
import { cardPricing } from "./card-pricing.ts";

const variant = { id: "a", sku: "A", label: "A", regularPricePaise: 10000, effectivePricePaise: 8000, isOnSale: true, saleEndsAt: null, availability: "available" };

test("card prices use published amounts and only identify an unambiguous discount", () => {
  assert.deepEqual(cardPricing([variant]), { price: "₹80.00", availability: "Available", originalPrice: "₹100.00", sourcePrice: false });
  assert.deepEqual(cardPricing([{ ...variant, effectivePricePaise: 10000, isOnSale: false }]), { price: "₹100.00", availability: "Available", originalPrice: null, sourcePrice: false });
  assert.deepEqual(cardPricing([variant, { ...variant, id: "b", effectivePricePaise: 10000, isOnSale: false }]), { price: "From ₹80.00", availability: "Available", originalPrice: null, sourcePrice: false });
  assert.deepEqual(cardPricing([variant, { ...variant, id: "b", effectivePricePaise: null, regularPricePaise: null, isOnSale: false }]), { price: "Price unavailable", availability: "Available", originalPrice: null, sourcePrice: false });
});

test("source prices use configured amounts while stock remains unverified", () => {
  const source = { ...variant, purchasable: false, cartEligible: true, availability: "unavailable" };
  assert.deepEqual(cardPricing([source], "₹90"), { price: "₹80.00", availability: "Availability unverified", originalPrice: "₹100.00", sourcePrice: true });
  assert.deepEqual(cardPricing([{ ...source, cartEligible: false, effectivePricePaise: null, regularPricePaise: null, isOnSale: false }], " ₹90 "), { price: "₹90", availability: "Availability unverified", originalPrice: null, sourcePrice: true });
  assert.deepEqual(cardPricing([{ ...source, cartEligible: false }]), { price: "Price unavailable", availability: "Availability unverified", originalPrice: null, sourcePrice: false });
  assert.deepEqual(cardPricing([]), { price: "Price unavailable", availability: "Availability unavailable", originalPrice: null, sourcePrice: false });
});
