import assert from "node:assert/strict";
import test from "node:test";
import {
  clearGuestCartAfterMerge,
  discardUnreadableGuestCart,
  getGuestCartSnapshot,
  saveGuestCart,
  subscribeGuestCart,
} from "./guest-cart-store.ts";

test("guest merge preserves changed storage and keeps in-memory cart when storage removal fails", () => {
  const values = new Map();
  const localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
  const handlers = new Map();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage,
      addEventListener(type, listener) { handlers.set(type, listener); },
      removeEventListener(type) { handlers.delete(type); },
    },
  });

  const key = "pandabyte.guest-cart.v1";
  const variantId = "11111111-1111-4111-8111-111111111111";
  const items = (quantity) => [{ variantId, quantity }];
  let unsubscribe = subscribeGuestCart(() => {});

  try {
    assert.deepEqual(saveGuestCart(items(1)), { persisted: true, invalid: false });
    const beforeChange = getGuestCartSnapshot();

    assert.deepEqual(saveGuestCart(items(2)), { persisted: true, invalid: false });
    const revisionChanged = clearGuestCartAfterMerge(beforeChange.items, beforeChange.revision);
    assert.deepEqual(revisionChanged, { ok: false, reason: "changed" });
    assert.deepEqual(getGuestCartSnapshot().items, items(2));

    const beforeExternalChange = getGuestCartSnapshot();
    localStorage.setItem(key, JSON.stringify({ version: 1, items: items(3) }));
    const storageChanged = clearGuestCartAfterMerge(beforeExternalChange.items, beforeExternalChange.revision);
    assert.deepEqual(storageChanged, { ok: false, reason: "changed" });
    assert.deepEqual(getGuestCartSnapshot().items, items(3));
    assert.deepEqual(JSON.parse(localStorage.getItem(key)).items, items(3));

    const beforeSave = getGuestCartSnapshot();
    localStorage.setItem(key, JSON.stringify({ version: 1, items: items(4) }));
    const staleSave = saveGuestCart(items(5), { items: beforeSave.items, revision: beforeSave.revision });
    assert.deepEqual(staleSave, { persisted: false, invalid: false, reason: "changed" });
    assert.deepEqual(getGuestCartSnapshot().items, items(4));
    assert.deepEqual(JSON.parse(localStorage.getItem(key)).items, items(4));

    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("storage quota"); };
    const writeFailed = saveGuestCart(items(5));
    assert.deepEqual(writeFailed, { persisted: false, invalid: false });
    assert.deepEqual(getGuestCartSnapshot().items, items(5));
    assert.deepEqual(JSON.parse(localStorage.getItem(key)).items, items(4));

    const memoryEditAfterWriteFailure = saveGuestCart(items(6));
    assert.deepEqual(memoryEditAfterWriteFailure, { persisted: false, invalid: false });
    assert.deepEqual(getGuestCartSnapshot().items, items(6));
    assert.deepEqual(JSON.parse(localStorage.getItem(key)).items, items(4));

    handlers.get("storage")({ key });
    handlers.get("storage")({ key: null });
    assert.deepEqual(getGuestCartSnapshot().items, items(6));
    assert.equal(getGuestCartSnapshot().storageWarning, true);

    localStorage.setItem = originalSetItem;
    assert.equal(discardUnreadableGuestCart(), true);
    localStorage.setItem(key, JSON.stringify({ version: 1, items: items(4) }));
    handlers.get("storage")({ key });
    const beforeStorageFailure = getGuestCartSnapshot();
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = () => { throw new Error("storage denied"); };
    const removalFailed = clearGuestCartAfterMerge(beforeStorageFailure.items, beforeStorageFailure.revision);
    assert.deepEqual(removalFailed, { ok: false, reason: "storage" });
    assert.deepEqual(getGuestCartSnapshot().items, items(4));
    assert.equal(getGuestCartSnapshot().storageWarning, true);
    assert.deepEqual(JSON.parse(values.get(key)).items, items(4));

    localStorage.removeItem = originalRemoveItem;
    assert.equal(discardUnreadableGuestCart(), true);
    const malformed = "{not-json";
    localStorage.setItem(key, malformed);
    handlers.get("storage")({ key });
    assert.equal(getGuestCartSnapshot().invalidStoredCart, true);
    assert.deepEqual(saveGuestCart(items(6)), { persisted: false, invalid: true, reason: "invalid" });
    assert.equal(localStorage.getItem(key), malformed);

    const oversized = "x".repeat(8193);
    localStorage.setItem(key, oversized);
    handlers.get("storage")({ key });
    assert.equal(getGuestCartSnapshot().invalidStoredCart, true);
    assert.deepEqual(saveGuestCart(items(7)), { persisted: false, invalid: true, reason: "invalid" });
    assert.equal(localStorage.getItem(key), oversized);
    assert.equal(discardUnreadableGuestCart(), true);
    unsubscribe();
    localStorage.setItem(key, JSON.stringify({ version: 1, items: items(7) }));
    unsubscribe = subscribeGuestCart(() => {});
    assert.deepEqual(getGuestCartSnapshot().items, items(7));
  } finally {
    unsubscribe();
    if (originalWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: originalWindow });
  }
});
