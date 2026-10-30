import assert from "node:assert/strict";
import test from "node:test";
import { parseTestBill, hasPaidTestBill } from "../lib/orders/test-bill.ts";

import { orderFixture, reference } from "./test-order-bill-fixture.mjs";

test("test bill projects only stored purchase details and exact integer amounts", () => {
  const order = orderFixture();
  order.snapshot.currentProfile = { name: "Unrelated updated profile" };
  order.snapshot.provisionalPolicy = { tax: "unapproved" };
  const bill = parseTestBill(order, reference);
  assert.equal(bill.lines[0].sku, "SAVED-SKU");
  assert.equal(bill.billing.line1, "Saved address");
  assert.equal(bill.totalPaise, 12345);
  assert.equal(bill.subtotalPaise + bill.shippingPaise + bill.taxPaise, bill.totalPaise);
  assert.equal("currentProfile" in bill, false);
  assert.equal("provisionalPolicy" in bill, false);
});

test("test bill denies every other environment and unpaid state", () => {
  for (const environment of ["simulation", "legacy", "live", "razorpay_live"]) {
    const order = { ...orderFixture(), environment };
    assert.equal(hasPaidTestBill(order), false); assert.equal(parseTestBill(order, reference), null);
  }
  for (const paymentState of ["pending", "verified", "failed", "cancelled", "review", "simulated"]) {
    const order = { ...orderFixture(), paymentState };
    assert.equal(hasPaidTestBill(order), false); assert.equal(parseTestBill(order, reference), null);
  }
});

test("test bill rejects malformed and inconsistent snapshot money, line counts and addresses", () => {
  const cases = [
    order => { order.totalPaise++; }, order => { order.snapshot.quote.subtotalPaise++; },
    order => { order.snapshot.quote.lines[0].lineTotalPaise++; }, order => { order.snapshot.quote.lines[0].variant.effectivePricePaise++; },
    order => { order.snapshot.fictionalTaxPaise = -1; }, order => { order.totalPaise = Number.MAX_SAFE_INTEGER + 1; },
    order => { order.snapshot.chargesAreFictional = false; }, order => { order.snapshot.quote.lines = []; },
    order => { order.snapshot.quote.lines = Array(51).fill(order.snapshot.quote.lines[0]); },
    order => { order.snapshot.quote.lines[0].quantity = 100; }, order => { order.snapshot.quote.lines[0].title = "X".repeat(301); },
    order => { order.snapshot.billing.line1 = "\u0000malicious"; }, order => { order.snapshot.shipping = null; },
    order => { order.snapshot.quote.lines[0].variant.sku = {}; }, order => { order.currency = "USD"; },
    order => { order.createdAt = "invalid"; }, order => { order.reference = "foreign"; },
  ];
  for (const change of cases) { const order = orderFixture(); change(order); assert.equal(parseTestBill(order, reference), null, change.toString()); }
  assert.equal(parseTestBill(orderFixture(), "TST-unsafe\r\nheader"), null);
});
