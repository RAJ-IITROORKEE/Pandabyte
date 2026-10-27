import test from "node:test";
import assert from "node:assert/strict";
import { parseSimulationRequest, parseSimulationRecovery, parseOrderQuery, parseAdminOrderUpdate, isOrderReference } from "../lib/checkout/validation.ts";
const id = "a1234567-1234-4234-8234-123456789abc";
const address = { recipientName: "A", phone: "+91 9876543210", line1: "Road", line2: "", city: "Delhi", state: "Delhi", postalCode: "110001", country: "India" };
const input = { idempotencyKey: id, mode: "cart", expectedCartVersion: 1, expectedSubtotalPaise: 100, items: [{ variantId: id, quantity: 1 }], contact: { email: "a@example.com", firstName: "A", lastName: "B", phone: "9876543210" }, shipping: address, billing: address, business: "", gstin: "" };
test("recovery accepts only a request key, never client order outcomes or identities", () => {
  assert.equal(parseSimulationRecovery({ idempotencyKey: id }), id);
  for (const value of [null, [], {}, { idempotencyKey: "invalid" }, { idempotencyKey: id, state: "created" }, { idempotencyKey: id, subject: "other" }]) assert.equal(parseSimulationRecovery(value), null);
});
test("simulation accepts bounded server-priced lines and rejects tampering", () => {
  assert.ok(parseSimulationRequest(input));
  assert.equal(parseSimulationRequest({ ...input, totalPaise: 1 }), null);
  assert.equal(parseSimulationRequest({ ...input, items: [{ ...input.items[0], price: 1 }] }), null);
  assert.equal(parseSimulationRequest({ ...input, shipping: { ...address, postalCode: "123" } }), null);
  assert.equal(parseSimulationRequest({ ...input, mode: "buy-now", expectedCartVersion: 1 }), null);
  assert.ok(parseSimulationRequest({ ...input, mode: "buy-now", expectedCartVersion: null }));
});
test("order queries and staff updates reject unbounded and unsafe input", () => {
  assert.deepEqual(parseOrderQuery(new URLSearchParams("limit=10&offset=10000")), { limit: 10, offset: 10000 });
  assert.equal(parseOrderQuery(new URLSearchParams("limit=10&limit=50")), null);
  assert.equal(parseOrderQuery(new URLSearchParams("offset=10001")), null);
  assert.equal(isOrderReference(`SIM-${id}`), true);
  assert.equal(isOrderReference(`TST-${id}`), true);
  assert.equal(isOrderReference(`TST-invalid`), false);
  const update = { expectedVersion: 1, status: "processing", shipping: { carrier: "", trackingNumber: "", trackingUrl: "https://example.com/track" } };
  assert.ok(parseAdminOrderUpdate(update));
  assert.equal(parseAdminOrderUpdate({ ...update, shipping: { ...update.shipping, trackingUrl: "javascript:alert(1)" } }), null);
  assert.equal(parseAdminOrderUpdate({ ...update, expectedVersion: 0 }), null);
});
