import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isOrderReference } from "../lib/checkout/validation.ts";
import * as billContract from "../lib/orders/test-bill.ts";
import { orderFixture, reference } from "./test-order-bill-fixture.mjs";

const require = createRequire(import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const compiled = compile("app/api/admin/orders/[reference]/document/route.ts");
function harness({ access = { allowed: true }, order = orderFixture(), status = 200, backendThrows = false, renderThrows = false } = {}) {
  const exports = {}, calls = [], rendered = [], capabilities = [];
  const error = (code, status) => Response.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  runInNewContext(compiled, { exports, Response, Uint8Array, require(name) {
    if (name === "@/lib/authorization") return { requireCapability: async capability => { capabilities.push(capability); return access; } };
    if (name === "@/lib/checkout/http") return { cartError: error, orderRpc: async (name, args) => { calls.push({ name, args }); if (backendThrows) throw Error("private backend detail"); return status === 200 ? Response.json(order) : error("not_found", status); } };
    if (name === "@/lib/checkout/validation") return { isOrderReference };
    if (name === "@/lib/orders/test-bill") return billContract;
    if (name === "@/lib/orders/test-bill-pdf") return { renderTestBillPdf: async bill => { rendered.push(bill); if (renderThrows) throw Error("private renderer detail"); return Buffer.from("%PDF-admin-fixture"); } };
    throw Error(`Unexpected import ${name}`);
  } });
  return { get: (ref = reference) => exports.GET(new Request(`http://localhost/api/admin/orders/${ref}/document`), { params: Promise.resolve({ reference: ref }) }), calls, rendered, capabilities };
}

test("Admin bill denies signed-out and non-capable callers before querying or rendering", async () => {
  for (const [status, code] of [[401, "unauthorized"], [403, "forbidden"], [503, "backend_unavailable"]]) {
    const h = harness({ access: { allowed: false, status } }), response = await h.get();
    assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
    assert.deepEqual(h.capabilities, ["staff.manage"]); assert.equal(h.calls.length, 0); assert.equal(h.rendered.length, 0);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
  }
});

test("Admin bill validates reference and preserves protected RPC failures without rendering", async () => {
  const invalid = harness(); assert.equal((await invalid.get("malformed")).status, 404); assert.equal(invalid.calls.length, 0);
  for (const status of [401, 403, 404, 503]) {
    const h = harness({ status }), response = await h.get();
    assert.equal(response.status, status); assert.equal(h.rendered.length, 0);
    assert.equal(h.calls[0].name, "admin_get_checkout_order"); assert.equal(h.calls[0].args.p_reference, reference);
  }
});

test("Admin bill rejects non-test, unpaid and malformed returned snapshots", async () => {
  for (const change of [{ environment: "simulation" }, { environment: "razorpay_live" }, ...["pending", "verified", "review", "failed", "cancelled"].map(paymentState => ({ paymentState }))]) {
    const h = harness({ order: { ...orderFixture(), ...change } });
    assert.equal((await h.get()).status, 409); assert.equal(h.rendered.length, 0);
  }
  for (const order of [null, {}, { ...orderFixture(), reference: "TST-22222222-2222-4222-8222-222222222222" }, { ...orderFixture(), totalPaise: 1 }]) {
    const h = harness({ order }); assert.equal((await h.get()).status, 503); assert.equal(h.rendered.length, 0);
  }
});

test("Admin bill renders the authorized stored snapshot and returns private attachment headers", async () => {
  const order = orderFixture(), h = harness({ order }), response = await h.get();
  assert.equal(response.status, 200); assert.deepEqual(h.capabilities, ["staff.manage"]);
  assert.deepEqual(h.rendered, [billContract.parseTestBill(order, reference)]);
  assert.equal(h.calls[0].name, "admin_get_checkout_order");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="pandabyte-test-bill-${reference}.pdf"`);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), "%PDF-admin-fixture");
});

test("Admin bill masks backend and renderer failures", async () => {
  for (const options of [{ backendThrows: true }, { renderThrows: true }]) {
    const response = await harness(options).get();
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private .* detail/);
  }
});

test("Admin order toolbar offers download only for paid test orders and the Admin document route", () => {
  const source = compile("components/admin/order-detail.tsx");
  for (const [environment, paymentState, expected] of [["razorpay_test", "paid", true], ["razorpay_test", "review", false], ["razorpay_test", "pending", false], ["simulation", "simulated", false], ["live", "paid", false]]) {
    const order = { ...orderFixture(), environment, paymentState }, exports = {};
    let cursor = 0;
    runInNewContext(source, { exports, Intl, Date, URL, require(name) {
      if (name === "react") return { ...require("react"), useEffect() {}, useState: initial => [cursor++ === 0 ? order : initial, () => {}] };
      if (name === "@clerk/nextjs") return { useUser: () => ({ isLoaded: true, user: { id: "admin" } }) };
      if (name === "@/components/admin/admin-shell") return { useAdminCapabilities: () => ["staff.manage"] };
      if (name === "@/components/admin/record-screens") return { AdminAccessDeniedScreen: () => null };
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => createElement("a", props, children) };
      if (name.endsWith(".module.css")) return { default: {} };
      return require(name);
    } });
    const tree = exports.AdminOrderDetail({ reference }), html = renderToStaticMarkup(createElement(tree.type, tree.props));
    assert.equal(html.includes("Download test bill PDF"), expected);
    if (expected) assert.ok(html.includes(`/api/admin/orders/${reference}/document`));
  }
});
