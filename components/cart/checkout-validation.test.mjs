import test from "node:test";
import assert from "node:assert/strict";
import { emptyAddress, validateStep, isValidContact, isValidGstin } from "./checkout-validation.ts";

test("checkout validates each required step and optional GSTIN format", () => {
  const d = { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", phone: "+91 98765 43210", news: false, shipping: { ...emptyAddress(), recipientName: "Ada", phone: "+91 98765 43210", line1: "1 Main Street", city: "Pune", state: "Maharashtra", postalCode: "411001" }, billing: emptyAddress(), sameBilling: true, business: "", gstin: "" };
  assert.deepEqual(validateStep(d, 0), {});
  assert.deepEqual(validateStep(d, 1), {});
  assert.ok(validateStep({ ...d, email: "bad", lastName: "" }, 0).email);
  assert.ok(validateStep({ ...d, sameBilling: false }, 1)["billing.line1"]);
  assert.ok(validateStep({ ...d, shipping: { ...d.shipping, postalCode: "123" }, gstin: "bad" }, 1)["shipping.postalCode"]);
  assert.ok(validateStep({ ...d, gstin: "bad" }, 1).gstin);
  assert.equal(isValidContact("Ada", "ada@example.com", "+91 98765 43210"), true);
  assert.ok(validateStep({ ...d, phone: "-------" }, 0).phone);
  assert.ok(validateStep({ ...d, shipping: { ...d.shipping, phone: "() () ()" } }, 1)["shipping.phone"]);
  assert.equal(isValidContact("Ada", "ada@example.com", "-------"), false);
  assert.equal(Object.keys(validateStep({ ...d, shipping: { ...emptyAddress(), recipientName: "Ada" } }, 1))[0], "shipping.phone");
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
});
