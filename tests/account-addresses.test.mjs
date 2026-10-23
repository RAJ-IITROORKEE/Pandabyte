import assert from "node:assert/strict";
import test from "node:test";
import {
  isCustomerAddressId,
  parseCustomerAddressCreate,
  parseCustomerAddressDelete,
  parseCustomerAddressUpdate,
} from "../lib/account/addresses.ts";

const validAddress = {
  label: "  Home  ",
  recipientName: "  Ada Lovelace  ",
  phone: "  +91 98765 43210  ",
  line1: "  1 Analytical Engine Road  ",
  line2: "  ",
  city: "  Dehradun  ",
  state: "  Uttarakhand  ",
  postalCode: "  248001  ",
  country: "in",
  isDefaultShipping: true,
  isDefaultBilling: false,
};

test("address creates trim fields, normalize country and allow optional phone/line2", () => {
  assert.deepEqual(parseCustomerAddressCreate(validAddress), {
    label: "Home",
    recipientName: "Ada Lovelace",
    phone: "+91 98765 43210",
    line1: "1 Analytical Engine Road",
    line2: "",
    city: "Dehradun",
    state: "Uttarakhand",
    postalCode: "248001",
    country: "IN",
    isDefaultShipping: true,
    isDefaultBilling: false,
  });

  assert.deepEqual(parseCustomerAddressCreate({ ...validAddress, phone: "", line2: "" })?.phone, "");
});

test("address fields reject unknown keys, missing fields, invalid values and oversized text", () => {
  assert.equal(parseCustomerAddressCreate({ ...validAddress, userId: "other" }), null);
  assert.equal(parseCustomerAddressCreate(Object.fromEntries(Object.entries(validAddress).filter(([key]) => key !== "line2"))), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, isDefaultBilling: "true" }), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, country: "India" }), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, phone: 7 }), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, label: "  " }), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, line1: "x".repeat(201) }), null);
  assert.equal(parseCustomerAddressCreate({ ...validAddress, recipientName: "Name\nInjected" }), null);
});

test("updates require a full editable address and a safe positive expected version", () => {
  assert.equal(parseCustomerAddressUpdate({ ...validAddress, expectedVersion: 1 })?.expectedVersion, 1);
  for (const expectedVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    assert.equal(parseCustomerAddressUpdate({ ...validAddress, expectedVersion }), null);
  }
  assert.equal(parseCustomerAddressUpdate({ ...validAddress, expectedVersion: 1, phoneVerified: true }), null);
});

test("delete accepts only a safe positive expected version", () => {
  assert.deepEqual(parseCustomerAddressDelete({ expectedVersion: 8 }), { expectedVersion: 8 });
  assert.equal(parseCustomerAddressDelete({ expectedVersion: 1, id: "another-field" }), null);
  assert.equal(parseCustomerAddressDelete({ expectedVersion: 0 }), null);
});

test("address ids must be UUIDs before they reach RPC arguments", () => {
  assert.equal(isCustomerAddressId("6b20a341-f049-46a2-8dc1-7a07373e3115"), true);
  assert.equal(isCustomerAddressId("not-a-uuid"), false);
});
