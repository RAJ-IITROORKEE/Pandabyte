import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/order-confirmation.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
const mocks = { "@clerk/nextjs": {}, "next/link": {}, "lucide-react": {}, "./checkout-money": {}, "./order-success-animation": {}, "./order-confirmation.module.css": {} };
runInNewContext(compiled, { exports, require: name => mocks[name] ?? require(name) });
const base = { environment: "razorpay_test", paymentState: "paid", status: "processing" };
test("only backend paid test orders in processing or fulfilled are confirmed", () => {
  assert.equal(exports.confirmed(base), true);
  assert.equal(exports.confirmed({ ...base, status: "fulfilled" }), true);
  for (const change of [{ environment: "simulation" }, { environment: "legacy" }, { paymentState: "verified" }, { paymentState: "failed" }, { status: "pending" }, { status: "cancelled" }]) assert.equal(exports.confirmed({ ...base, ...change }), false);
});
test("only unresolved test orders poll", () => {
  assert.equal(exports.pending({ ...base, paymentState: "verified", status: "pending" }), true);
  for (const change of [{ environment: "simulation" }, { paymentState: "failed" }, { paymentState: "cancelled" }, { paymentState: "review" }, { status: "cancelled" }]) assert.equal(exports.pending({ ...base, ...change }), false);
  assert.equal(exports.pending(base), false);
});
test("order responses must belong to the requested reference and contain safe display values", () => {
  const order = { ...base, reference: "TST-1", totalPaise: 100, snapshot: { quote: { lines: [{ title: "Board", quantity: 1, lineTotalPaise: 100 }] } } };
  assert.equal(exports.validOrder(order, "TST-1"), true);
  assert.equal(exports.validOrder(order, "TST-2"), false);
  for (const change of [{ status: null }, { totalPaise: -1 }, { snapshot: null }, { snapshot: { quote: { lines: [{ title: "Board", quantity: -1, lineTotalPaise: 100 }] } } }]) assert.equal(exports.validOrder({ ...order, ...change }, "TST-1"), false);
});

test("confirmation renders the purchased snapshot and never promotes a review order to success", () => {
  const order = { ...base, reference: "TST-fixture", createdAt: "2026-10-27T12:00:00Z", totalPaise: 12000, snapshot: { shipping: { recipientName: "Fixture recipient", line1: "Original address", city: "Delhi", state: "Delhi", postalCode: "110001", country: "India", phone: "000" }, quote: { subtotalPaise: 12000, lines: [{ title: "Fixture sensor", quantity: 2, lineTotalPaise: 12000, variant: { sku: "TEST-SKU", effectivePricePaise: 6000 } }] }, shipment: { trackingUrl: "javascript:alert(1)" } } };
  function render(paymentState) {
    const mod = {};
    const deps = {
      "@clerk/nextjs": { useUser: () => ({ isLoaded: true, user: { id: "test-user" } }) },
      "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
      "lucide-react": { Check: () => null, Package: () => null },
      "./checkout-money": { formatPaise: value => String(value) },
      "./order-success-animation": { OrderSuccessAnimation: () => createElement("span", { "data-success-animation": true }) },
      "./order-confirmation.module.css": { default: {} },
      react: { useEffect() {}, useState: initial => [initial === null ? { ...order, paymentState } : initial, () => {}] },
    };
    runInNewContext(compiled, { exports: mod, URL, Intl, Date, require: name => deps[name] ?? require(name) });
    return renderToStaticMarkup(createElement(mod.OrderConfirmation, { reference: order.reference }));
  }
  const paid = render("paid");
  for (const expected of [/Thank you for your order/, /Fixture sensor/, /Original address/, /TEST-SKU/, /Qty: 2/, /Purchased image unavailable/]) assert.match(paid, expected);
  assert.doesNotMatch(paid, /javascript:|email.*sent|Download receipt/i);
  assert.match(paid, /data-success-animation/);
  const review = render("review");
  assert.match(review, /requires review/);
  assert.doesNotMatch(review, /Thank you for your order|still being checked/);
  assert.doesNotMatch(review, /data-success-animation/);
});

test("confirmation fetches the owner-scoped order read-only and ignores an aborted result", async () => {
  const mod = {}, state = [], requests = [];
  let cursor = 0, effect;
  const deps = {
    "@clerk/nextjs": { useUser: () => ({ isLoaded: true, user: { id: "owner" } }) },
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "lucide-react": { Check: () => null, Package: () => null },
    "./checkout-money": { formatPaise: value => String(value) }, "./order-confirmation.module.css": { default: {} },
    "./order-success-animation": { OrderSuccessAnimation: () => null },
    react: { useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; }, useEffect(fn) { effect = fn; } },
  };
  runInNewContext(compiled, { exports: mod, URL, Intl, Date, AbortController, setTimeout, clearTimeout, require: name => deps[name] ?? require(name), fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
  const session = mod.OrderConfirmation({ reference: "TST-fixture" });
  const render = () => { cursor = 0; return renderToStaticMarkup(session.type(session.props)); };
  assert.match(render(), /confirming your payment/);
  const cleanup = effect();
  assert.equal(requests[0].url, "/api/account/orders/TST-fixture");
  assert.equal(requests[0].options.method, undefined);
  assert.equal(requests[0].options.cache, "no-store");
  cleanup();
  requests[0].resolve({ ok: true, json: async () => ({ ...base, reference: "TST-fixture", totalPaise: 100, snapshot: {} }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(render(), /confirming your payment/);
  assert.doesNotMatch(render(), /Thank you for your order/);
});
