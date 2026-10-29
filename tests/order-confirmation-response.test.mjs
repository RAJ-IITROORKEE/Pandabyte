import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), exports = {};
const source = readFileSync(new URL("../components/cart/order-confirmation.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const mocks = Object.fromEntries(["@clerk/nextjs", "next/link", "lucide-react", "./checkout-money", "./order-success-animation", "./order-confirmation.module.css"].map(name => [name, {}]));
runInNewContext(compiled, { exports, require: name => mocks[name] ?? require(name) });
const address = { recipientName: "Example Customer", phone: "000", line1: "Example Street", city: "Example City", state: "Example State", postalCode: "000000", country: "IN" };
function order(snapshot = {}) {
  return { reference: "TST-response-check", status: "review", paymentState: "review", environment: "razorpay_test", totalPaise: 100, snapshot: { shipping: address, shipment: {}, quote: { lines: [{ title: "Example item", quantity: 1, lineTotalPaise: 100 }] }, ...snapshot } };
}
const accepts = value => exports.validOrder(value, "TST-response-check");

test("confirmation accepts sparse snapshots without requiring delivery, billing or optional money", () => {
  assert.equal(accepts(order()), true);
  assert.equal(accepts(order({ shipping: null, billing: null, shipment: null, quote: null })), true);
  assert.equal(accepts(order({ shipping: { ...address, line2: null }, quote: { subtotalPaise: null, lines: [{ title: "Example", quantity: 1, lineTotalPaise: 100, variant: null }] } })), true);
});

for (const [name, snapshot] of [
  ["address object child", { shipping: { ...address, recipientName: { unexpected: true } } }],
  ["billing array child", { billing: { ...address, city: [{ unexpected: true }] } }],
  ["shipment object child", { shipment: { carrier: { unexpected: true } } }],
  ["variant object child", { quote: { lines: [{ title: "Example", quantity: 1, lineTotalPaise: 100, variant: { label: { unexpected: true } } }] } }],
  ["variant array SKU", { quote: { lines: [{ title: "Example", quantity: 1, lineTotalPaise: 100, variant: { sku: [{ unexpected: true }] } }] } }],
  ["string subtotal", { quote: { subtotalPaise: "100", lines: [] } }],
  ["fractional shipping", { fictionalShippingPaise: 1.5 }],
  ["negative tax", { fictionalTaxPaise: -1 }],
  ["unsafe variant money", { quote: { lines: [{ title: "Example", quantity: 1, lineTotalPaise: 100, variant: { effectivePricePaise: Number.MAX_SAFE_INTEGER + 1 } }] } }],
  ["nonboolean fictional marker", { chargesAreFictional: "false" }],
]) test(`confirmation rejects ${name} before rendering`, () => assert.equal(accepts(order(snapshot)), false));
