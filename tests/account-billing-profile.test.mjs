import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as billing from "../lib/account/billing-profile.ts";
import * as profile from "../lib/account/profile.ts";
import { isSameOriginRequest, readBoundedBody } from "../lib/storage/http.ts";

const input = { expectedVersion: 0, businessName: " Example Workshop ", contactEmail: " billing@example.com ", gstin: "27abcde1234f1z5" };
const saved = { version: 1, businessName: "Example Workshop", contactEmail: "billing@example.com", gstin: "27ABCDE1234F1Z5" };
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/account/billing-profile/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function harness({ session = { isAuthenticated: true, sessionStatus: "active", userId: "test-customer" }, result = saved, rpcError = null, throws = false } = {}) {
  const calls = [], exports = {};
  runInNewContext(compiled, { exports, Response, TextDecoder, require(name) {
    if (name === "@clerk/nextjs/server") return { auth: async () => session };
    if (name === "@/lib/account/billing-profile") return billing;
    if (name === "@/lib/account/profile") return profile;
    if (name === "@/lib/storage/http") return { isSameOriginRequest, readBoundedBody };
    if (name === "@/lib/observability/events") return { operationalJson: (body, status, headers) => Response.json(body, { status, headers }) };
    if (name === "@/lib/insforge/server") return { createInsforgeServerClient: async () => ({ database: { schema(schema) {
      assert.equal(schema, "public");
      return { rpc: async (name, args) => { calls.push({ name, args }); if (throws) throw Error("private backend detail"); return { data: result, error: rpcError }; } };
    } } }) };
    throw Error(`Unexpected import ${name}`);
  } });
  return { ...exports, calls };
}
function request(method = "PUT", body = input, headers = {}) {
  return new Request("http://localhost/api/account/billing-profile", {
    method, headers: { "x-account-owner": "test-customer", origin: "http://localhost", "content-type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

test("billing fields normalize optional future-checkout details and allow clearing", () => {
  assert.deepEqual(billing.parseBillingProfileInput(input), { expectedVersion: 0, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key !== "version")) });
  assert.deepEqual(billing.parseBillingProfileInput({ expectedVersion: 1, businessName: "", contactEmail: "", gstin: "" }), { expectedVersion: 1, businessName: "", contactEmail: "", gstin: "" });
  assert.ok(billing.parseBillingProfile({ ...saved, version: Number.MAX_SAFE_INTEGER }));
});

test("billing accepts only editable fields, bounded values and safe versions", () => {
  for (const field of ["userId", "role", "verified", "isDefaultBilling", "addressId"]) assert.equal(billing.parseBillingProfileInput({ ...input, [field]: "untrusted" }), null);
  for (const expectedVersion of [-1, 0.5, "1", null, Number.MAX_SAFE_INTEGER]) assert.equal(billing.parseBillingProfileInput({ ...input, expectedVersion }), null);
  for (const change of [{ businessName: "x".repeat(161) }, { businessName: "bad\nname" }, { businessName: "bad\u0085name" }, { contactEmail: "x".repeat(255) }, { contactEmail: "bad@value" }, { contactEmail: "bad email@example.com" }, { gstin: "not-a-gstin" }, { gstin: "".padEnd(16, "0") }]) assert.equal(billing.parseBillingProfileInput({ ...input, ...change }), null);
  assert.equal(billing.parseBillingProfile({ ...saved, userId: "private" }), null);
});

test("billing reads require the active matching account and preserve private response headers", async () => {
  for (const session of [{}, { isAuthenticated: true, sessionStatus: "pending", userId: "test-customer" }]) {
    const h = harness({ session });
    assert.equal((await h.GET(request("GET"))).status, 401);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal((await h.PUT(request("PUT", input, { "x-account-owner": "other-account" }))).status, 409);
  assert.equal(h.calls.length, 0);
  const response = await h.GET(request("GET"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { billingProfile: saved });
  assert.equal(h.calls[0].name, "customer_get_billing_profile");
});

test("billing mutations reject origin/type/body/field violations before invoking the database", async () => {
  for (const [body, headers, status] of [[input, { origin: "https://other.example" }, 403], [input, { "content-type": "text/plain" }, 415], ["{", {}, 400], ["x".repeat(4097), { "content-length": "1" }, 413], [{ ...input, role: "ADMIN" }, {}, 400]]) {
    const h = harness();
    assert.equal((await h.PUT(request("PUT", body, headers))).status, status);
    assert.equal(h.calls.length, 0);
  }
});

test("billing mutation supplies only validated values and maps conflicts and backend failures safely", async () => {
  const h = harness();
  assert.deepEqual(await (await h.PUT(request())).json(), { billingProfile: saved });
  assert.equal(h.calls[0].name, "customer_save_billing_profile");
  assert.deepEqual({ ...h.calls[0].args }, { p_expected_version: 0, p_business_name: "Example Workshop", p_contact_email: "billing@example.com", p_gstin: "27ABCDE1234F1Z5" });
  for (const [options, status, code] of [[{ rpcError: { code: "P0001", details: "version_conflict" } }, 409, "conflict"], [{ rpcError: { code: "P0001", details: "invalid_input" } }, 400, "invalid_billing_profile"], [{ result: { ...saved, private: "must not leak" } }, 503, "backend_unavailable"], [{ throws: true }, 503, "backend_unavailable"]]) {
    const response = await harness(options).PUT(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
});
