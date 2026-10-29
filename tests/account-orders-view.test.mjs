import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url), exports = {};
const source = readFileSync(new URL("../components/account-orders.tsx", import.meta.url), "utf8");
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, URL, Intl, Date, require: name => name === "@/components/ui/button" ? { buttonClassName: () => "button" } : name === "lucide-react" ? Object.fromEntries(["Package", "Search", "ExternalLink", "RefreshCw"].map(icon => [icon, () => createElement("svg")])) : name.endsWith(".module.css") ? { default: {} } : name === "next/link" ? { default: ({ children, ...props }) => createElement("a", props, children) } : require(name) });
const data = overrides => ({ query: "", status: "all", search() {}, filter() {}, retry() {}, setOffset() {}, error: "", orders: { items: [], total: 0, offset: 0, limit: 20 }, ...overrides });
const render = value => renderToStaticMarkup(createElement(exports.AccountOrders, { data: value }));
test("failed, loading, empty and filtered histories remain distinct", () => {
  assert.match(render(data({ error: "Unavailable" })), /role="alert"/);
  assert.match(render(data({ orders: null })), /Loading orders/);
  assert.match(render(data()), /No orders yet/);
  assert.match(render(data({ query: "TST-1" })), /No matching orders/);
  assert.match(render(data({ status: "delivered" })), /Confirmed delivery is not recorded/);
});
test("cards retain purchased addresses, units, separate payment status and safe tracking", () => {
  const order = { reference: "TST-fixture", status: "fulfilled", paymentState: "paid", environment: "razorpay_test", totalPaise: 45000, createdAt: "2026-10-27T12:00:00Z", snapshot: { shipping: { recipientName: "Purchased recipient", line1: "Original purchase address", city: "Delhi", country: "India" }, shipment: { trackingUrl: "javascript:alert(1)" }, quote: { lines: Array.from({ length: 4 }, (_, i) => ({ title: `Sensor ${i}`, quantity: 2, lineTotalPaise: 10000 })) } } };
  const html = render(data({ orders: { items: [order], total: 1, offset: 0, limit: 20 } }));
  for (const expected of [/Fulfilled/, /Payment: paid/, /8 units/, /4 product lines/, /Original purchase address/, /View order/, /\+1/, /1–1 of 1/]) assert.match(html, expected);
  assert.doesNotMatch(html, /javascript:|>Reorder</);
  const tracked = render(data({ orders: { items: [{ ...order, snapshot: { ...order.snapshot, shipment: { trackingUrl: "https://example.com/track" } } }], total: 1, offset: 0, limit: 20 } }));
  assert.match(tracked, /href="https:\/\/example.com\/track"/);
});
