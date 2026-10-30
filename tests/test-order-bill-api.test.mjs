import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isOrderReference } from "../lib/checkout/validation.ts";
import * as billContract from "../lib/orders/test-bill.ts";
import { orderFixture, reference } from "./test-order-bill-fixture.mjs";

const compiled = ts.transpileModule(readFileSync(new URL("../app/api/account/orders/[reference]/document/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness({ authenticated = true, order = orderFixture(), status = 200, renderError = false } = {}) {
  const exports = {}, calls = [], renderCalls = [];
  const error = (code, status) => Response.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  runInNewContext(compiled, { exports, Response, Uint8Array, require(name) {
    if (name === "@/lib/checkout/http") return { activeCartSession: async () => authenticated, cartError: error, orderRpc: async (name, args) => { calls.push({ name, args }); return status === 200 ? Response.json(order) : error("not_found", status); } };
    if (name === "@/lib/checkout/validation") return { isOrderReference };
    if (name === "@/lib/orders/test-bill") return billContract;
    if (name === "@/lib/orders/test-bill-pdf") return { renderTestBillPdf: async bill => { renderCalls.push(bill); if (renderError) throw new Error("private render detail"); return Buffer.from("%PDF-fixture"); } };
    throw Error(`Unexpected import: ${name}`);
  } });
  return { get: (ref = reference) => exports.GET(new Request(`http://localhost/api/account/orders/${ref}/document`), { params: Promise.resolve({ reference: ref }) }), calls, renderCalls };
}

test("bill API rejects absent sessions and invalid references before data/render access", async () => {
  const anonymous = harness({ authenticated: false });
  assert.equal((await anonymous.get()).status, 401); assert.equal(anonymous.calls.length, 0);
  const invalid = harness(); assert.equal((await invalid.get("malformed")).status, 404); assert.equal(invalid.calls.length, 0);
});
test("bill API preserves owner RPC denial and backend failure without rendering", async () => {
  for (const status of [401, 403, 404, 503]) {
    const h = harness({ status }); const response = await h.get();
    assert.equal(response.status, status); assert.equal(h.renderCalls.length, 0);
    assert.equal(h.calls[0].name, "customer_get_checkout_order");
    assert.equal(h.calls[0].args.p_reference, reference);
  }
});
test("bill API gates unpaid/simulation states and malformed snapshot without producing a PDF", async () => {
  for (const change of [{ environment: "simulation" }, ...["pending", "verified", "review", "failed", "cancelled"].map(paymentState => ({ paymentState }))]) {
    const h = harness({ order: { ...orderFixture(), ...change } });
    assert.equal((await h.get()).status, 409); assert.equal(h.renderCalls.length, 0);
  }
  const h = harness({ order: { ...orderFixture(), totalPaise: 1 } });
  assert.equal((await h.get()).status, 503); assert.equal(h.renderCalls.length, 0);
});
test("bill API returns a private safe PDF attachment and hides render errors", async () => {
  const h = harness(), response = await h.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), `attachment; filename="pandabyte-test-bill-${reference}.pdf"`);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await response.text(), "%PDF-fixture");
  const failure = await harness({ renderError: true }).get();
  assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /private render detail/);
});
