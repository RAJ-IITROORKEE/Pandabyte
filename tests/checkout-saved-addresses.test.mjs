import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { emptyAddress } from "../components/cart/checkout-validation.ts";

const source = readFileSync(new URL("../components/cart/checkout-review.tsx", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("function checkoutAddress"), source.indexOf("export function CheckoutReview"));
const compiled = ts.transpileModule(`${helpers}\nexport { initializeAddresses, initializeBilling };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
runInNewContext(compiled, { exports });
const address = (id, flags) => ({ id, recipientName: id, phone: "1234567890", line1: "Road", line2: "", city: "Pune", state: "MH", postalCode: "411001", country: "IN", ...flags });
const saved = [address("ship", { isDefaultShipping: true }), address("bill", { isDefaultBilling: true })];
const draft = () => ({ shipping: emptyAddress(), billing: emptyAddress(), sameBilling: true });

test("distinct defaults apply separately while preserving existing addresses and choices", () => {
  const result = exports.initializeAddresses(draft(), saved, { shipping: false, billing: false, sameBilling: false });
  assert.equal(result.shipping.recipientName, "ship");
  assert.equal(result.billing.recipientName, "bill");
  assert.equal(result.shipping.country, "India");
  assert.equal(result.sameBilling, false);
  const existing = draft(); existing.shipping.line1 = "Customer edit";
  const preserved = exports.initializeAddresses(existing, saved, { shipping: false, billing: true, sameBilling: false });
  assert.equal(preserved.shipping.line1, "Customer edit");
  assert.equal(preserved.billing.recipientName, "");
  assert.equal(preserved.sameBilling, true);
  const explicit = exports.initializeAddresses(draft(), saved, { shipping: false, billing: false, sameBilling: true });
  assert.equal(explicit.sameBilling, true);
  const oneDefault = [address("both", { isDefaultShipping: true, isDefaultBilling: true })];
  assert.equal(exports.initializeAddresses(draft(), oneDefault, { shipping: false, billing: false, sameBilling: false }).sameBilling, true);
  const onlyShipping = exports.initializeAddresses(draft(), saved.slice(0, 1), { shipping: false, billing: false, sameBilling: false });
  assert.equal(onlyShipping.sameBilling, true);
  const onlyBilling = exports.initializeAddresses(draft(), saved.slice(1), { shipping: false, billing: false, sameBilling: false });
  assert.equal(onlyBilling.billing.recipientName, "bill");
  assert.equal(onlyBilling.sameBilling, false);
  const onlyBillingExplicit = exports.initializeAddresses(draft(), saved.slice(1), { shipping: false, billing: false, sameBilling: true });
  assert.equal(onlyBillingExplicit.sameBilling, true);
});

test("both address selectors use the same saved-address conversion", () => {
  assert.match(source, /savedAddressSelect\("shipping"\)/);
  assert.match(source, /savedAddressSelect\("billing"\)/);
  assert.match(source, /\[prefix\]: checkoutAddress\(a\)/);
});


test("billing prefill only fills untouched empty fields and never replaces checkout email", () => {
  const profile = { businessName: "Example business", gstin: "27ABCDE1234F1Z5", contactEmail: "billing@example.test" };
  const empty = { ...draft(), business: "", gstin: "", email: "buyer@example.test" };
  const filled = exports.initializeBilling(empty, profile, { business: false, gstin: false });
  assert.equal(filled.business, profile.businessName);
  assert.equal(filled.gstin, profile.gstin);
  assert.equal(filled.email, empty.email);
  const changed = exports.initializeBilling({ ...empty, business: "Entered" }, profile, { business: false, gstin: true });
  assert.equal(changed.business, "Entered");
  assert.equal(changed.gstin, "");
});

test("billing profile request is owner-scoped and aborts on session cleanup", () => {
  assert.match(source, /fetch\("\/api\/account\/billing-profile", \{ cache: "no-store", signal: controller.signal, headers: \{ "x-account-owner": userId \} \}\)/);
  assert.match(source, /parseBillingProfile\(body\?\.billingProfile\)/);
  assert.match(source, /Saved billing details could not be loaded/);
});
