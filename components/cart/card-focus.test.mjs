import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

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
    "./cart-api": {}, "./customer-cart-store": {},
    "./cart-utils": { removeCartItem: items => items.filter(item => item.variantId !== "a"), setCartItemQuantity: () => null },
    "./guest-cart-store": { saveGuestCart: items => { guest = { ...guest, items, revision: 2 }; return { persisted: true }; } },
    "./cart.module.css": { default: {} },
  };
  runInNewContext(`${compiled}\nexports.Session = AddToCartButtonSession;`, { exports, require: name => dependencies[name] ?? require(name), AbortController });
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
  find(first, node => node.type === "button" && node.props["aria-label"] === "Remove one Widget from cart").props.onClick();
  render();
  assert.equal(focused, available ? "button" : "status");
});
