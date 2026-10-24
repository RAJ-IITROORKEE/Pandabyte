import assert from "node:assert/strict";
import test from "node:test";
import { addCartItem, mergeGuestCart, removeCartItem, sameCartItems, setCartItemQuantity } from "./cart-utils.ts";

const line = (variantId, quantity) => ({ variantId, quantity });

test("guest merge keeps the higher matching quantity and preserves distinct lines", () => {
  assert.deepEqual(
    mergeGuestCart([line("a", 2)], [line("a", 5), line("b", 1)]),
    [line("a", 5), line("b", 1)],
  );
  assert.deepEqual(mergeGuestCart([line("a", 7)], [line("a", 3)]), [line("a", 7)]);
});

test("guest merge refuses a union larger than the server line limit", () => {
  const server = Array.from({ length: 50 }, (_, index) => line(`server-${index}`, 1));
  assert.equal(mergeGuestCart(server, [line("guest-new", 1)]), null);
  assert.equal(mergeGuestCart(server, [server[0]]).length, 50);
});

test("cart snapshot comparison ignores ordering but catches changed quantities and lines", () => {
  assert.equal(sameCartItems([line("a", 2), line("b", 1)], [line("b", 1), line("a", 2)]), true);
  assert.equal(sameCartItems([line("a", 2)], [line("a", 3)]), false);
  assert.equal(sameCartItems([line("a", 2)], [line("a", 2), line("b", 1)]), false);
});

test("cart line helpers enforce bounds without mutating the input", () => {
  const items = [line("a", 98)];
  assert.deepEqual(addCartItem(items, "a"), [line("a", 99)]);
  assert.equal(addCartItem([line("a", 99)], "a"), null);
  assert.deepEqual(setCartItemQuantity(items, "a", 1), [line("a", 1)]);
  assert.equal(setCartItemQuantity(items, "a", 100), null);
  assert.deepEqual(removeCartItem(items, "a"), []);
  assert.deepEqual(items, [line("a", 98)]);
});
