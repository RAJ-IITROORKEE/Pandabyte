import assert from "node:assert/strict";
import test from "node:test";
import { clearCustomerCart, getCustomerCartSnapshot, prepareCustomerCart, publishCustomerCart, subscribeCustomerCart } from "./customer-cart-store.ts";
import { replaceCustomerCart } from "./cart-api.ts";

const cart = version => ({ version, items: [], quote: { lines: [], subtotalPaise: 0, readyForCheckout: false } });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("shared loads deduplicate, preserve newer updates, and reset between sessions", async () => {
  let reject;
  let requests = 0;
  globalThis.fetch = () => { requests++; return new Promise((_, fail) => { reject = fail; }); };
  let notices = 0;
  const unsubscribe = subscribeCustomerCart(() => notices++);
  prepareCustomerCart("user-a");
  prepareCustomerCart("user-a");
  assert.equal(requests, 1);
  publishCustomerCart("user-a", cart(2));
  publishCustomerCart("user-a", cart(1));
  reject(new Error("offline"));
  await tick();
  assert.equal(getCustomerCartSnapshot().cart.version, 2);
  assert.equal(getCustomerCartSnapshot().error, false);
  clearCustomerCart();
  assert.equal(getCustomerCartSnapshot().cart, null);
  prepareCustomerCart("user-a");
  assert.equal(requests, 2);
  clearCustomerCart();
  reject(new Error("old session"));
  await tick();
  assert.equal(getCustomerCartSnapshot().cart, null);
  assert.equal(getCustomerCartSnapshot().error, false);
  assert.ok(notices >= 2);
  unsubscribe();
});

test("version conflicts surface without replacing cart state", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "conflict" } }), { status: 409 });
  await assert.rejects(replaceCustomerCart(2, []), error => error.status === 409 && error.code === "conflict");
});
