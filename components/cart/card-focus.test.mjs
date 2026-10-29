import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { cardQuantityValue } from "./card-quantity.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./add-to-cart-button.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
for (const available of [true, false]) test(`final removal focuses ${available ? "add button" : "unavailable status"}`, () => {
  const hooks = [];
  let cursor = 0, effects = [], focused = "";
  const body = {}, removeButton = {};
  const document = { body, activeElement: removeButton };
  let guest = { ready: true, invalidStoredCart: false, items: [{ variantId: "a", quantity: 1 }], revision: 1 };
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({}) },
    "lucide-react": { Plus: "plus", Minus: "minus", ShoppingCart: "cart" },
    react: {
      useSyncExternalStore: () => guest,
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
      useEffect: (callback, deps) => { const index = cursor++; const old = hooks[index]; if (!old || (deps && deps.some((v, i) => !Object.is(v, old[i])))) { hooks[index] = deps; effects.push(callback); } },
    },
    "./cart-api": {}, "./customer-cart-store": {}, "./buy-now-store": {},
    "./cart-utils": { removeCartItem: items => items.filter(item => item.variantId !== "a"), setCartItemQuantity: () => null },
    "./guest-cart-store": { saveGuestCart: items => { guest = { ...guest, items, revision: 2 }; return { persisted: true }; } },
    "./card-quantity": { cardQuantityValue },
    "./cart.module.css": { default: {} },
    "@/components/ui/button": { buttonClassName: () => "button" },
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController, document });
  function render() {
    cursor = 0; effects = [];
    const tree = exports.Session({ variantId: "a", available, quantity: 1, userId: null, showBuyNow: false, compactLabel: "Widget" });
    const button = find(tree, node => node.type === "button" && node.props.ref);
    if (button) button.props.ref.current = { disabled: button.props.disabled, focus: () => { focused = "button"; } };
    const status = find(tree, node => node.type === "span" && node.props.tabIndex === -1);
    if (status) status.props.ref.current = { focus: () => { focused = "status"; } };
    effects.forEach(effect => effect());
    return tree;
  }
  const first = render();
  find(first, node => node.type === "button" && node.props["aria-label"] === "Remove one Widget from cart").props.onClick({ currentTarget: removeButton });
  document.activeElement = body;
  render();
  assert.equal(focused, available ? "button" : "status");
});

for (const signedIn of [false, true]) test(`${signedIn ? "signed-in" : "guest"} add restores focus only for its own focused activation`, async () => {
  const hooks = [];
  let cursor = 0, effects = [], resolveUpdate, updateCalls = 0, readCalls = 0;
  const body = {}, elsewhere = {};
  const document = { body, activeElement: body };
  let guest = { ready: true, invalidStoredCart: false, items: [], revision: 1 };
  let customer = { userId: "user", cart: { items: [], version: 1 } };
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({}) },
    "lucide-react": { Plus: "plus", Minus: "minus", ShoppingCart: "cart" },
    react: {
      useSyncExternalStore: subscribe => subscribe === "customer" ? customer : guest,
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
      useEffect: (callback, deps) => { const index = cursor++; const old = hooks[index]; if (!old || (deps && deps.some((v, i) => !Object.is(v, old[i])))) { hooks[index] = deps; effects.push(callback); } },
    },
    "./cart-api": { loadCustomerCart: async () => { readCalls++; return customer.cart; }, replaceCustomerCart: () => { updateCalls++; return new Promise(resolve => { resolveUpdate = resolve; }); } },
    "./customer-cart-store": { subscribeCustomerCart: "customer", getCustomerCartSnapshot: () => customer, prepareCustomerCart: () => {}, publishCustomerCart: (_user, cart) => { customer = { userId: "user", cart }; } },
    "./buy-now-store": {},
    "./cart-utils": { addCartItem: items => [...items, { variantId: "a", quantity: 1 }], setCartItemQuantity: (items, _id, quantity) => items.map(item => ({ ...item, quantity })), removeCartItem: () => [] },
    "./guest-cart-store": { saveGuestCart: items => { guest = { ...guest, items, revision: 2 }; return { persisted: true }; } },
    "./card-quantity": { cardQuantityValue },
    "./cart.module.css": { default: {} },
    "@/components/ui/button": { buttonClassName: () => "button" },
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController, document });
  function render() {
    cursor = 0; effects = [];
    const tree = exports.Session({ variantId: "a", available: true, quantity: 1, userId: signedIn ? "user" : null, showBuyNow: false, compactLabel: "Widget" });
    const button = find(tree, node => node.type === "button" && node.props.ref);
    if (button && !button.props.ref.current) button.props.ref.current = { focus: () => { document.activeElement = button.props.ref.current; } };
    const link = find(tree, node => node.type === "a" && node.props.ref);
    if (link) link.props.ref.current = { focus: () => { document.activeElement = link.props.ref.current; } };
    effects.forEach(effect => effect());
    return { tree, button, link };
  }
  async function add(moveFocus) {
    const { button } = render();
    document.activeElement = button.props.ref.current;
    button.props.onClick();
    if (signedIn) {
      await new Promise(resolve => setImmediate(resolve));
      const pending = render().button;
      if (pending.props.disabled) { document.activeElement = body; pending.props.onBlur(); }
      assert.equal(pending.props["aria-disabled"], true);
      assert.equal(document.activeElement, pending.props.ref.current);
      const previousCalls = updateCalls;
      pending.props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(updateCalls, previousCalls);
      if (moveFocus) { document.activeElement = elsewhere; button.props.onBlur(); }
      resolveUpdate({ items: [{ variantId: "a", quantity: 1 }], version: 2 });
      await new Promise(resolve => setImmediate(resolve));
    }
    if (!moveFocus) document.activeElement = body;
    else if (!signedIn) document.activeElement = elsewhere;
    const { link } = render();
    assert.equal(document.activeElement, moveFocus ? elsewhere : link.props.ref.current);
  }
  await add(false);
  if (signedIn) assert.equal(readCalls, 0, "a loaded card uses its versioned cart without another read");
  if (signedIn) {
    const plus = find(render().tree, node => node.props?.["aria-label"] === "Add one Widget to cart");
    const plusElement = {};
    document.activeElement = plusElement;
    plus.props.onClick({ currentTarget: plusElement });
    const pending = find(render().tree, node => node.props?.["aria-label"] === "Add one Widget to cart");
    if (pending.props.disabled) document.activeElement = body;
    assert.equal(pending.props["aria-disabled"], true);
    assert.equal(document.activeElement, plusElement);
    const previousCalls = updateCalls;
    pending.props.onClick({ currentTarget: plusElement });
    assert.equal(updateCalls, previousCalls);
    resolveUpdate({ items: [{ variantId: "a", quantity: 2 }], version: 3 });
    await new Promise(resolve => setImmediate(resolve));
    render();
    assert.equal(document.activeElement, plusElement);
    const minus = find(render().tree, node => node.props?.["aria-label"] === "Remove one Widget from cart");
    customer = { ...customer, cart: { items: [{ variantId: "a", quantity: 1 }], version: 4 } };
    document.activeElement = plusElement;
    find(render().tree, node => node.props?.["aria-label"] === "Remove one Widget from cart").props.onClick({ currentTarget: plusElement });
    document.activeElement = elsewhere;
    minus.props.onBlur();
    resolveUpdate({ items: [], version: 5 });
    await new Promise(resolve => setImmediate(resolve));
    render();
    assert.equal(document.activeElement, elsewhere);
  }
  guest = { ...guest, items: [] }; customer = { ...customer, cart: { items: [], version: 3 } };
  render();
  await add(true);
  guest = { ...guest, items: [] }; customer = { ...customer, cart: { items: [], version: 4 } };
  render();
  document.activeElement = elsewhere;
  if (signedIn) customer = { ...customer, cart: { items: [{ variantId: "a", quantity: 1 }], version: 5 } };
  else guest = { ...guest, items: [{ variantId: "a", quantity: 1 }] };
  render();
  assert.equal(document.activeElement, elsewhere);
});

test("full-size add keeps focus while pending and does not steal it on error", async () => {
  const hooks = [], body = {}, buttonElement = {}, elsewhere = {};
  let cursor = 0, effects = [], rejectLoad;
  const document = { body, activeElement: buttonElement };
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({}) },
    "lucide-react": { Plus: "plus", Minus: "minus", ShoppingCart: "cart" },
    react: {
      useSyncExternalStore: () => ({}),
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
      useEffect: (callback, deps) => { const index = cursor++; const old = hooks[index]; if (!old || (deps && deps.some((v, i) => !Object.is(v, old[i])))) { hooks[index] = deps; effects.push(callback); } },
    },
    "./cart-api": { loadCustomerCart: () => new Promise((_resolve, reject) => { rejectLoad = reject; }), cartErrorMessage: () => "Could not load cart" },
    "./customer-cart-store": {}, "./guest-cart-store": {}, "./cart-utils": {}, "./buy-now-store": {},
    "./card-quantity": { cardQuantityValue },
    "./cart.module.css": { default: {} },
    "@/components/ui/button": { buttonClassName: () => "button" },
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController, document });
  function render() {
    cursor = 0; effects = [];
    const tree = exports.Session({ variantId: "a", available: true, quantity: 1, userId: "user", showBuyNow: false });
    const button = find(tree, node => node.type === "button");
    if (button.props.disabled && document.activeElement === buttonElement) document.activeElement = body;
    effects.forEach(effect => effect());
    return { tree, button };
  }
  render().button.props.onClick();
  const pending = render().button;
  assert.equal(pending.props["aria-disabled"], true);
  assert.equal(document.activeElement, buttonElement);
  document.activeElement = elsewhere;
  rejectLoad(new Error("offline"));
  await new Promise(resolve => setImmediate(resolve));
  const failed = render();
  assert.ok(find(failed.tree, node => node.props?.role === "alert"));
  assert.equal(document.activeElement, elsewhere);
});

test("product card follows guest cart changes and uses cart quantity for buy", () => {
  const hooks = []; let cursor = 0, effects = [], selection;
  let guest = { ready: true, invalidStoredCart: false, items: [], revision: 1 };
  const document = { body: {}, activeElement: {} }, exports = {};
  const dependencies = {
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "lucide-react": { Plus: "plus", Minus: "minus", ShoppingCart: "cart", ShoppingCartPlus: "cartPlus", Zap: "zap" },
    react: {
      useSyncExternalStore: subscribe => subscribe === "customer" ? {} : guest,
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
      useEffect: (callback, deps) => { const index = cursor++; const old = hooks[index]; if (!old || (deps && deps.some((v, i) => !Object.is(v, old[i])))) { hooks[index] = deps; effects.push(callback); } },
    },
    "./cart-api": {}, "./customer-cart-store": { subscribeCustomerCart: "customer" },
    "./buy-now-store": { setBuyNowSelection: value => { selection = value; return true; } },
    "./cart-utils": { addCartItem: (_items, variantId, quantity) => [{ variantId, quantity }], setCartItemQuantity: (_items, variantId, quantity) => [{ variantId, quantity }], removeCartItem: () => [] },
    "./guest-cart-store": { saveGuestCart: items => { guest = { ...guest, items, revision: guest.revision + 1 }; return { persisted: true }; } },
    "./card-quantity": { cardQuantityValue },
    "./cart.module.css": { default: { cardAdd: "cardAdd", cardActive: "cardActive" } }, "@/components/ui/button": {},
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController, document });
  function render() { cursor = 0; effects = []; const tree = exports.Session({ variantId: "a", available: true, quantity: 1, userId: null, showBuyNow: false, card: { title: "Widget", pricing: null, quickView: null } }); effects.forEach(effect => effect()); return tree; }
  const get = (tree, label) => find(tree, node => node.props?.["aria-label"] === label);
  let tree = render();
  assert.ok(get(tree, "Add to cart: Widget"));
  assert.equal(get(tree, "Add one Widget to cart"), undefined);
  get(tree, "Add to cart: Widget").props.onClick();
  tree = render();
  assert.match(get(tree, "View cart: Widget, quantity 1").props.className, /cardActive/);
  get(tree, "Add one Widget to cart").props.onClick({ currentTarget: {} });
  tree = render();
  assert.ok(get(tree, "View cart: Widget, quantity 2"));
  let input = get(tree, "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "4" } });
  input = get(render(), "Quantity for Widget");
  input.props.onBlur({ currentTarget: {} });
  tree = render();
  assert.ok(get(tree, "View cart: Widget, quantity 4"));
  input = get(tree, "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "8" } });
  guest = { ...guest, items: [], revision: guest.revision + 1 };
  render();
  guest = { ...guest, items: [{ variantId: "a", quantity: 4 }], revision: guest.revision + 1 };
  tree = render();
  assert.equal(get(tree, "Quantity for Widget").props.value, "4");
  get(tree, "Quantity for Widget").props.onBlur({ currentTarget: {} });
  assert.equal(guest.items[0].quantity, 4);
  input = get(render(), "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "3" } });
  input = get(render(), "Quantity for Widget");
  input.props.onBlur({ currentTarget: { parentElement: { contains: () => false } }, relatedTarget: { getAttribute: () => "true" } });
  assert.equal(guest.items[0].quantity, 3);
  input = get(render(), "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "4" } });
  get(render(), "Quantity for Widget").props.onBlur({ currentTarget: {} });
  input = get(render(), "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "100" } });
  input = get(render(), "Quantity for Widget");
  assert.equal(input.props["aria-invalid"], true);
  input.props.onBlur({ currentTarget: {} });
  tree = render();
  assert.equal(get(tree, "Quantity for Widget").props.value, "4");
  assert.ok(find(tree, node => node.props?.role === "alert"));
  find(tree, node => node.type === "button" && node.props.children?.some?.(child => child === " Buy")).props.onClick();
  assert.equal(selection[0].quantity, 4);
  guest = { ...guest, items: [{ variantId: "a", quantity: 1 }] };
  tree = render();
  get(tree, "Remove one Widget from cart").props.onClick({ currentTarget: {} });
  tree = render();
  assert.ok(get(tree, "Add to cart: Widget"));
  assert.equal(get(tree, "Remove one Widget from cart"), undefined);
});

test("product card waits for its customer cart and locks updates after a failed write", async () => {
  const hooks = []; let cursor = 0, effects = [], prepared, rejectUpdate, updateCalls = 0, requested;
  let customer = { userId: "other", cart: { items: [{ variantId: "a", quantity: 3 }], version: 1 } };
  const document = { body: {}, activeElement: {} }, exports = {};
  const dependencies = {
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({}) },
    "lucide-react": { Plus: "plus", Minus: "minus", ShoppingCart: "cart", ShoppingCartPlus: "cartPlus", Zap: "zap" },
    react: {
      useSyncExternalStore: subscribe => subscribe === "customer" ? customer : { ready: true, items: [] },
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
      useEffect: (callback, deps) => { const index = cursor++; const old = hooks[index]; if (!old || (deps && deps.some((v, i) => !Object.is(v, old[i])))) { hooks[index] = deps; effects.push(callback); } },
    },
    "./cart-api": { replaceCustomerCart: (version, items) => { updateCalls++; requested = { version, items }; return new Promise((_resolve, reject) => { rejectUpdate = reject; }); }, cartErrorMessage: () => "Could not update cart" },
    "./customer-cart-store": { subscribeCustomerCart: "customer", prepareCustomerCart: user => { prepared = user; } }, "./guest-cart-store": {}, "./buy-now-store": {},
    "./cart-utils": { setCartItemQuantity: (_items, variantId, quantity) => [{ variantId, quantity }] },
    "./card-quantity": { cardQuantityValue },
    "./cart.module.css": { default: {} }, "@/components/ui/button": {},
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController, document });
  function render() { cursor = 0; effects = []; const tree = exports.Session({ variantId: "a", available: true, quantity: 1, userId: "user", showBuyNow: false, card: { title: "Widget", pricing: null, quickView: null } }); effects.forEach(effect => effect()); return tree; }
  const get = (tree, label) => find(tree, node => node.props?.["aria-label"] === label);
  let tree = render();
  assert.equal(prepared, "user");
  assert.equal(get(tree, "Add to cart: Widget").props.disabled, true);
  assert.equal(get(tree, "Add one Widget to cart"), undefined);
  customer = { userId: "user", cart: { items: [{ variantId: "a", quantity: 2 }], version: 1 } };
  tree = render();
  let input = get(tree, "Quantity for Widget");
  input.props.onChange({ currentTarget: { value: "5" } });
  input = get(render(), "Quantity for Widget");
  input.props.onBlur({ currentTarget: { parentElement: { contains: () => true } }, relatedTarget: { getAttribute: () => "true" } });
  assert.equal(updateCalls, 0);
  get(render(), "Add one Widget to cart").props.onBlur({ currentTarget: { parentElement: { contains: () => true } }, relatedTarget: { getAttribute: () => "true" } });
  assert.equal(updateCalls, 0);
  get(render(), "Remove one Widget from cart").props.onClick({ currentTarget: {} });
  assert.equal(updateCalls, 1);
  assert.equal(requested.version, 1);
  assert.equal(requested.items[0].quantity, 4);
  assert.equal(get(render(), "Add one Widget to cart").props["aria-disabled"], true);
  rejectUpdate(new Error("offline"));
  await new Promise(resolve => setImmediate(resolve));
  tree = render();
  assert.equal(get(tree, "Add one Widget to cart").props.disabled, true);
  assert.ok(find(tree, node => node.props?.role === "alert"));
  assert.ok(get(tree, "View cart: Widget, quantity 2"));
  assert.equal(get(tree, "Quantity for Widget").props.value, "2");
});
