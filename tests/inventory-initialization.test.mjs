import assert from "node:assert/strict";
import test from "node:test";
import { parseInventoryInitialization } from "../lib/admin/inventory-initialization-contract.ts";

const body = { expectedVersion: 0, quantity: 0, reason: "  Physical count verified  ", requestId: "d9428888-122b-41e1-b85c-61cd3cbb3210" };

test("explicit source counts include verified zero and preserve version and request identity", () => {
  assert.deepEqual(parseInventoryInitialization(body), { ok: true, value: { ...body, reason: "Physical count verified" } });
  for (const quantity of [1, 1_000_000]) assert.equal(parseInventoryInitialization({ ...body, quantity }).ok, true);
  assert.equal(parseInventoryInitialization({ ...body, expectedVersion: 12 }).ok, true);
});

test("initial counts reject coercion, missing fields, unsafe numbers, unsupported input and invalid reasons", () => {
  for (const quantity of [undefined, null, "0", "", -1, 0.5, 1_000_001, NaN, Infinity]) {
    assert.equal(parseInventoryInitialization({ ...body, quantity }).ok, false, String(quantity));
  }
  for (const expectedVersion of [undefined, null, "0", -1, 0.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseInventoryInitialization({ ...body, expectedVersion }).ok, false);
  }
  for (const input of [null, [], 1, "", { ...body, delta: 5 }, { ...body, sourceOnly: false }, { ...body, reason: " " }, { ...body, reason: "bad\u0000reason" }, { ...body, reason: "a".repeat(501) }, { ...body, requestId: "bad" }]) {
    assert.equal(parseInventoryInitialization(input).ok, false);
  }
});
