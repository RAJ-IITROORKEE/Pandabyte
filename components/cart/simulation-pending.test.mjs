import assert from "node:assert/strict";
import test from "node:test";
import { readPending, savePending, clearPending } from "./simulation-pending.ts";

const values = new Map();
const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
const id = "00000000-0000-4000-8000-000000000001";
const address = { recipientName: "Fixture", phone: "9999999999", line1: "Test", line2: "", city: "Pune", state: "Maharashtra", postalCode: "411001", country: "India" };
const raw = JSON.stringify({ idempotencyKey: id, mode: "buy-now", expectedCartVersion: null, expectedSubtotalPaise: 100, items: [{ variantId: id, quantity: 1 }], contact: { email: "fixture@example.test", firstName: "Test", lastName: "User", phone: "9999999999" }, shipping: address, billing: address, business: "", gstin: "" });

test("pending simulation stores only a scoped marker and preserves exact request in memory", async () => {
  values.clear(); savePending(storage, "user-a", raw);
  assert.deepEqual([...values.values()], [id]);
  assert.equal(readPending(storage, "user-a").raw, raw);
  assert.equal(readPending(storage, "user-b").pending, false);
  const reloaded = await import(`./simulation-pending.ts?reload=${Date.now()}`);
  assert.deepEqual(reloaded.readPending(storage, "user-a"), { pending: true, raw: null });
  assert.throws(() => savePending(storage, "user-a", raw.replace(id, "00000000-0000-4000-8000-000000000002")));
  clearPending(storage, "user-a");
  assert.equal(readPending(storage, "user-a").pending, false);
});
test("invalid payloads and storage failures fail closed", () => {
  values.clear();
  assert.throws(() => savePending(storage, "user-a", "{}"));
  assert.equal(readPending(storage, "user-a").pending, false);
  assert.throws(() => savePending({ ...storage, setItem() { throw Error("unavailable"); } }, "user-a", raw));
  assert.equal(readPending(storage, "user-a").pending, false);
});
