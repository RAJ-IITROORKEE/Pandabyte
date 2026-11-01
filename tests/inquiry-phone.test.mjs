import test from "node:test";
import assert from "node:assert/strict";
import { validInquiryPhone } from "../lib/contact/phone.ts";

test("contact phone is optional or a bounded international number", () => {
  for (const value of ["", "+91 98765 43210", "+1 555 123 4567", "+44 123 456 7890"]) assert.equal(validInquiryPhone(value), true, value);
  for (const value of ["+91 123", "+91 12345678901", "+1 123", "1234567890", "+1 abcdef", "+1 123456789012345"]) assert.equal(validInquiryPhone(value), false, value);
});
