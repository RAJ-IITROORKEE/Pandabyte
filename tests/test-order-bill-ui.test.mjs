import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { orderFixture, reference } from "./test-order-bill-fixture.mjs";

const require = createRequire(import.meta.url);
function component(file, order, privateSession = true) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, Intl, Date, URL, require(name) {
    if (name === "react") return { ...require("react"), useEffect() {}, useState: initial => [privateSession && initial === null ? order : initial, () => {}] };
    if (name === "@clerk/nextjs") return { useUser: () => ({ isLoaded: true, user: { id: "customer" } }) };
    if (name === "next/link") return { default: ({ children, ...props }) => createElement("a", props, children) };
    if (name.endsWith(".module.css")) return { default: {} };
    if (name.endsWith("checkout-money")) return { formatPaise: value => String(value) };
    if (name.endsWith("order-success-animation")) return { OrderSuccessAnimation: () => null };
    if (name === "@/components/ui/button") return { buttonClassName: () => "button" };
    return require(name);
  } });
  return exports;
}

test("confirmation, summary and My Orders offer bill download only for paid Razorpay test orders", () => {
  const cases = [{ environment: "razorpay_test", paymentState: "paid", available: true },
    ...["pending", "verified", "failed", "cancelled", "review"].map(paymentState => ({ environment: "razorpay_test", paymentState, available: false })),
    { environment: "simulation", paymentState: "simulated", available: false }, { environment: "live", paymentState: "paid", available: false }];
  for (const item of cases) {
    const order = { ...orderFixture(), ...item };
    const document = component("components/account-order-document.tsx", order).AccountOrderDocument({ reference });
    const confirmation = component("components/cart/order-confirmation.tsx", order).OrderConfirmation({ reference });
    const orders = component("components/account-orders.tsx", order, false).AccountOrders({ data: { query: "", status: "all", orders: { items: [order], total: 1, offset: 0, limit: 20 }, error: "" } });
    for (const tree of [document, confirmation, orders]) {
      const html = renderToStaticMarkup(tree);
      assert.equal(html.includes("Download test bill PDF"), item.available, `${item.environment}/${item.paymentState}`);
      if (item.available) assert.ok(html.includes(`/api/account/orders/${reference}/document`));
    }
  }
});
