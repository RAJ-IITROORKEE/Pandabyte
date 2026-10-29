import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../components/account-order-document.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const order = { reference: "TST-fixture", createdAt: "2026-10-28T00:00:00Z", status: "processing", paymentState: "paid", environment: "razorpay_test", totalPaise: 1168, snapshot: { shipping: { recipientName: "Customer", line1: "Saved street" }, billing: null, fictionalShippingPaise: 100, fictionalTaxPaise: 68, chargesAreFictional: true, quote: { subtotalPaise: 1000, lines: [{ title: "Saved board", quantity: 2, lineTotalPaise: 1000, variant: { sku: "SAVED", effectivePricePaise: 500 } }] } } };
function setup(identity, hooks = {}) {
  const mod = {};
  const deps = { "@clerk/nextjs": { useUser: () => identity }, "next/link": { default: ({ children, ...props }) => createElement("a", props, children) }, "./cart/checkout-money": { formatPaise: value => String(value) }, "./account-order-document.module.css": { default: {} }, react: hooks };
  runInNewContext(compiled, { exports: mod, require: name => deps[name] ?? require(name), AbortController, Date, Intl, fetch: hooks.fetch });
  return mod;
}
test("validates all rendered snapshot values and matches the requested order", () => {
  const mod = setup({});
  assert.equal(mod.validOrderDocument(order, order.reference), true);
  assert.equal(mod.validOrderDocument(order, "different"), false);
  for (const snapshot of [{ ...order.snapshot, shipping: { line1: {} } }, { ...order.snapshot, fictionalTaxPaise: -1 }, { ...order.snapshot, quote: { lines: [{ title: "x", quantity: 1, lineTotalPaise: 1, variant: { sku: [] } }] } }]) assert.equal(mod.validOrderDocument({ ...order, snapshot }, order.reference), false);
  assert.equal(mod.validOrderDocument({ ...order, snapshot: { quote: null } }, order.reference), true);
});
test("renders stored details with prominent non-invoice and fictional charge labels", () => {
  const mod = setup({ isLoaded: true, user: { id: "owner" } }, { useEffect() {}, useState: initial => [initial === null ? order : initial, () => {}] });
  const outer = mod.AccountOrderDocument({ reference: order.reference });
  const html = renderToStaticMarkup(createElement(outer.type, outer.props));
  for (const text of [/ORDER SUMMARY — NOT A TAX INVOICE/, /Saved board/, /Saved street/, /SAVED/, /Fictional test tax/, /Print \/ Save as PDF/, /Not available/]) assert.match(html, text);
  assert.doesNotMatch(html, /GSTIN|tax invoice number/i);
});
test("session key changes with the active user and aborted fetch cannot update state", async () => {
  const state = [], requests = []; let cursor = 0, effect;
  const identity = { isLoaded: true, user: { id: "first" } };
  const mod = setup(identity, { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; }, useEffect(fn) { effect = fn; }, fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
  const first = mod.AccountOrderDocument({ reference: order.reference });
  identity.user = { id: "second" };
  assert.notEqual(first.key, mod.AccountOrderDocument({ reference: order.reference }).key);
  first.type(first.props); const cleanup = effect();
  assert.equal(requests[0].url, "/api/account/orders/TST-fixture");
  assert.equal(requests[0].options.cache, "no-store");
  cleanup(); requests[0].resolve({ ok: true, json: async () => order });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state[0], null);
});
