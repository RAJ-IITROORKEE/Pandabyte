import test from "node:test";
import assert from "node:assert/strict";
import { includedDiscount, formatPaise } from "./checkout-money.ts";

test("checkout discounts use integer paise and exclude missing or unchanged prices", () => {
  assert.equal(includedDiscount([
    { quantity: 3, variant: { regularPricePaise: 48000, effectivePricePaise: 36000 } },
    { quantity: 2, variant: { regularPricePaise: 30000, effectivePricePaise: 30000 } },
    { quantity: 1, variant: null },
    { quantity: 1, variant: { regularPricePaise: null, effectivePricePaise: null } },
  ]), 36000);
  assert.equal(formatPaise(36000), "₹360.00");
  assert.equal(formatPaise(null), "Unavailable");
});
