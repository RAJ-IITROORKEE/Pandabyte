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

test("source prices retain their label and never imply availability or a sale", () => {
  assert.deepEqual(cardPricing([variant], " ₹80 "), { price: "₹80", availability: "Availability unavailable", originalPrice: null, sourcePrice: true });
  const unavailable = { price: "Price unavailable", availability: "Availability unavailable", originalPrice: null, sourcePrice: false };
  assert.deepEqual(cardPricing([variant], ""), unavailable);
  assert.deepEqual(cardPricing([{ ...variant, purchasable: false }]), unavailable);
  assert.deepEqual(cardPricing([]), unavailable);
});
