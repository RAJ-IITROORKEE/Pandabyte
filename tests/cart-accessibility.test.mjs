import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/cart-screen.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const initialItems = [{ variantId: "a", quantity: 1 }, { variantId: "b", quantity: 1 }];
const quote = items => ({ lines: items.map(item => ({ ...item, issue: null })), subtotalPaise: 100, readyForCheckout: true });
const cart = items => ({ version: 1, items, quote: quote(items) });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

function cartHarness({ signedIn = true, readError = false, items = initialItems } = {}) {
  const hooks = [];
  let cursor = 0, effects = [], headingRef, tree;
  let guest = { ready: true, items: signedIn ? [] : items, revision: 1, invalidStoredCart: false };
  let replace = async (_version, items) => cart(items);
  let requestQuote = async items => quote(items);
  const focused = [];
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": { useUser: () => ({ isLoaded: true, user: signedIn ? { id: "customer" } : null }) },
    "next/link": { default: "a" },
    react: {
      useId: () => "cart-test",
      useSyncExternalStore: () => guest,
      useState: initial => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
      },
      useRef: initial => {
        const index = cursor++;
        return hooks[index] ??= { current: initial };
      },
      useEffect: (callback, deps) => {
        const index = cursor++;
        const previous = hooks[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
          hooks[index] = { deps, cleanup: previous?.cleanup };
          effects.push(() => { hooks[index].cleanup?.(); hooks[index].cleanup = callback(); });
        }
      },
    },
    "./cart-api": {
      loadCustomerCart: async () => { if (readError) throw Error("unavailable"); return cart(items); },
      replaceCustomerCart: (...args) => replace(...args),
      quoteCart: (...args) => requestQuote(...args),
      cartErrorMessage: () => "Cart could not load",
    },
    "./customer-cart-store": { activateCustomerCart: () => {}, publishCustomerCart: () => {}, getCustomerCartSnapshot: () => ({ userId: null, cart: null }), subscribeCustomerCart: () => () => {} },
    "./cart-utils": {
      removeCartItem: (items, id) => items.filter(item => item.variantId !== id),
      setCartItemQuantity: (items, id, quantity) => items.map(item => item.variantId === id ? { ...item, quantity } : item),
    },
    "./guest-cart-store": {
      saveGuestCart: items => { guest = { ...guest, items, revision: guest.revision + 1 }; return { persisted: true }; },
    },
    "./cart.module.css": { default: {} },
  };
  runInNewContext(`${compiled}\nexports.CartSession = CartSession; exports.CartContents = CartContents;`, {
    exports, require: name => dependencies[name] ?? require(name), AbortController,
  });
  return {
    focused,
    replace: value => { replace = value; },
    requestQuote: value => { requestQuote = value; },
    render: () => {
      cursor = 0;
      effects = [];
      tree = exports.CartSession({ userId: signedIn ? "customer" : null, embedded: false });
      const contents = find(tree, node => node.type === exports.CartContents);
      if (headingRef) headingRef.current = null;
      if (contents) {
        const rendered = exports.CartContents(contents.props);
        const heading = find(rendered, node => node.type === "h2" && node.props.ref);
        headingRef = heading.props.ref;
        headingRef.current = { focus: () => focused.push(heading.props.children) };
      }
      effects.forEach(effect => effect());
      return contents?.props;
    },
    find: predicate => find(tree, predicate),
  };
}

test("cart load failures announce an alert", async () => {
  const review = cartHarness({ readError: true });
  review.render();
  await flush();
  review.render();
  assert.equal(review.find(node => node.props?.role === "alert").props.children, "Cart could not load");
  assert.deepEqual(review.focused, []);
});

for (const remaining of [initialItems.slice(1), []]) {
  test(`successful signed-in removal focuses ${remaining.length ? "Items" : "the empty cart heading"}`, async () => {
    const review = cartHarness({ items: remaining.length ? initialItems : initialItems.slice(0, 1) });
    review.render();
    await flush();
    const contents = review.render();
    const update = deferred();
    review.replace(() => update.promise);
    contents.onRemove("a");
    review.render();
    assert.deepEqual(review.focused, []);
    update.resolve(cart(remaining));
    await flush();
    review.render();
    assert.deepEqual(review.focused, [remaining.length ? "Items" : "Your cart is empty"]);
    review.render();
    assert.equal(review.focused.length, 1);
  });
}

test("quantity updates and failed removals do not move focus", async () => {
  const review = cartHarness();
  review.render();
  await flush();
  review.render().onUpdateQuantity("a", 2);
  await flush();
  const contents = review.render();
  assert.deepEqual(review.focused, []);
  review.replace(async () => { throw Error("conflict"); });
  contents.onRemove("a");
  await flush();
  review.render();
  assert.deepEqual(review.focused, []);
});

test("guest removal waits for refreshed prices before focusing the remaining heading", async () => {
  const review = cartHarness({ signedIn: false });
  review.render();
  await flush();
  const contents = review.render();
  const refresh = deferred();
  review.requestQuote(() => refresh.promise);
  contents.onRemove("a");
  const stale = review.render();
  assert.equal(stale.refreshing, true);
  assert.deepEqual(review.focused, []);
  refresh.resolve(quote(initialItems.slice(1)));
  await flush();
  review.render();
  assert.deepEqual(review.focused, ["Items"]);
});

test("a guest quote failure clears pending removal focus before retry", async () => {
  const review = cartHarness({ signedIn: false });
  review.render();
  await flush();
  const contents = review.render();
  review.requestQuote(async () => { throw Error("unavailable"); });
  contents.onRemove("a");
  review.render();
  await flush();
  review.render();
  review.requestQuote(async items => quote(items));
  review.find(node => node.type === "button" && node.props.children === "Try again").props.onClick();
  review.render();
  await flush();
  review.render();
  assert.deepEqual(review.focused, []);
});
