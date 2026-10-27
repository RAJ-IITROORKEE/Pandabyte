import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/checkout-review.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexport { SimulationRecovery };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const marker = "00000000-0000-4000-8000-000000000001";
const line = { variantId: marker, quantity: 1 };
const order = { reference: `SIM-${marker}`, environment: "simulation", paymentState: "simulated", totalPaise: 100, snapshot: { mode: "buy-now", quote: { lines: [line] } } };
function harness() {
  let hooks = [], cursor = 0, effect, cleanup, resolve, currentMarker = marker, selection = [line], completed, cartRefreshes = 0;
  const calls = [];
  const exports = {};
  const dependencies = {
    "./razorpay-test-payment": { RazorpayTest: () => null, markerKey: user => `pending:${user}` },
    react: { useState: initial => { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; }, useRef: initial => { const i = cursor++; return hooks[i] ??= { current: initial }; }, useEffect: fn => { effect = fn; } },
    "next/link": { default: "a" }, "next/image": { default: "img" }, "@clerk/nextjs": {}, "lucide-react": {},
    "./checkout-money": {}, "./checkout-draft": {}, "./checkout-validation": {}, "@/components/catalog/card-image-selection": {}, "./checkout-review.module.css": { default: {} },
    "./simulation-pending": { clearPending: (_storage, _user, expected) => { if (currentMarker !== expected) return false; currentMarker = null; return true; } },
    "./cart-utils": { sameCartItems: (a, b) => a.length === b.length && a.every((item, i) => item.variantId === b[i].variantId && item.quantity === b[i].quantity) },
    "./buy-now-store": { getBuyNowSelection: () => selection, clearBuyNowSelection: () => { selection = null; } },
    "./cart-api": { loadCustomerCart: async () => { cartRefreshes++; return {}; } }, "./customer-cart-store": { publishCustomerCart() {} },
  };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), AbortController, sessionStorage: {}, fetch: (url, options) => { calls.push({ url, options }); return new Promise(r => { resolve = r; }); } });
  function render() { cursor = 0; return exports.SimulationRecovery({ userId: "user-a", marker, onCompleted: result => { completed = result; }, onContinue() {} }); }
  render(); cleanup = effect();
  return { calls, render, ready: Promise.resolve(), respond: async (body, ok = true) => { resolve({ ok, json: async () => body }); await new Promise(r => setImmediate(r)); }, stop: () => cleanup(), setMarker: value => { currentMarker = value; }, setSelection: value => { selection = value; }, get marker() { return currentMarker; }, get selection() { return selection; }, get completed() { return completed; }, get cartRefreshes() { return cartRefreshes; } };
}
function textContent(tree) { return JSON.stringify(tree); }

test("reload checks only the saved key and shows a created result without clearing a different selection", async () => {
  const h = harness(); await h.ready; h.setSelection([{ ...line, quantity: 2 }]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].url, "/api/checkout/simulate/recover");
  assert.equal(h.calls[0].options.headers["x-account-owner"], "user-a");
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { idempotencyKey: marker });
  await h.respond({ state: "created", order });
  assert.equal(h.marker, null); assert.equal(h.completed.reference, order.reference); assert.equal(h.selection[0].quantity, 2);
  assert.equal(h.calls.length, 1);
});
test("missing result clears its marker and allows review without another submission", async () => {
  const h = harness(); await h.ready; await h.respond({ state: "not_created" });
  assert.equal(h.marker, null); assert.match(textContent(h.render()), /No simulated order was created/); assert.equal(h.calls.length, 1);
});
test("failed checks and changed markers keep the pending state", async () => {
  const h = harness(); await h.ready; await h.respond({}, false); assert.equal(h.marker, marker); assert.match(textContent(h.render()), /Check again/);
  const changed = harness(); await changed.ready; changed.setMarker("different"); await changed.respond({ state: "created", order });
  assert.equal(changed.marker, "different"); assert.equal(changed.completed, undefined); assert.match(textContent(changed.render()), /Check again/);
});
test("account switch aborts the check and ignores a late response", async () => {
  const h = harness(); await h.ready; h.stop(); assert.equal(h.calls[0].options.signal.aborted, true); await h.respond({ state: "created", order });
  assert.equal(h.marker, marker); assert.equal(h.completed, undefined);
});
test("cart recovery refreshes the authoritative cart", async () => {
  const h = harness(); await h.ready; await h.respond({ state: "created", order: { ...order, snapshot: { ...order.snapshot, mode: "cart" } } });
  assert.equal(h.cartRefreshes, 1); assert.equal(h.completed.reference, order.reference);
});
