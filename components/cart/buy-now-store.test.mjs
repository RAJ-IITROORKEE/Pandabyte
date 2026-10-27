import test from "node:test";
import assert from "node:assert/strict";
import { setBuyNowSelection, getBuyNowSelection, clearBuyNowSelection } from "./buy-now-store.ts";

test("buy now stores only validated selection and leaves ordinary cart storage intact", () => {
  const storage = new Map([["pandabyte.guest-cart.v1", "existing cart"]]);
  globalThis.window = { sessionStorage: { setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } };
  const line = { variantId: "12345678-1234-4234-8234-123456789012", quantity: 3 };
  assert.equal(setBuyNowSelection([line]), true);
  assert.deepEqual(getBuyNowSelection(), [line]);
  assert.equal(setBuyNowSelection([{ ...line, quantity: 100 }]), false);
  assert.deepEqual(getBuyNowSelection(), [line]);
  assert.equal(storage.get("pandabyte.guest-cart.v1"), "existing cart");
  clearBuyNowSelection();
  assert.equal(getBuyNowSelection(), null);
  window.sessionStorage.setItem = () => { throw new Error("disabled"); };
  assert.equal(setBuyNowSelection([line]), false);
  assert.equal(getBuyNowSelection(), null);
  delete globalThis.window;
});
