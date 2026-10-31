import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseStorefrontTestRequest, storefrontTestEnabled } from "../lib/checkout/storefront-test-validation.ts";
import { parseSimulationRequest } from "../lib/checkout/validation.ts";
import { hostedStorefrontTestEnabled, localRazorpayTestEnabled } from "../lib/checkout/test-deployment.ts";
import { parseCartQuoteRequest } from "../lib/cart/validation.ts";

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const quoteSource = compile("../lib/checkout/storefront-test.ts");
const paymentSource = compile("../lib/checkout/razorpay-test.ts");
const capabilitiesSource = compile("../app/api/checkout/razorpay-test/capabilities/route.ts");
const proxySource = compile("../proxy.ts");
const id = "11111111-1111-4111-8111-111111111111";
const item = { variantId: id, quantity: 1 };
const env = { NODE_ENV: "development", PANDABYTE_STOREFRONT_TEST_ENABLED: "true", PANDABYTE_RAZORPAY_TEST_ENABLED: "true", RAZORPAY_CHECKOUT_TEST_KEY: "p".repeat(32), RAZORPAY_TEST_KEY_ID: "rzp_test_123" };
const url = "http://localhost:3000/api/checkout/razorpay-test/quote";
const address = { recipientName: " A ", phone: "9876543210", line1: " Road ", line2: "", city: "Pune", state: "MH", postalCode: "411001", country: "India" };
const base = { idempotencyKey: id, mode: "cart", expectedCartVersion: 1, expectedSubtotalPaise: 10000, items: [item], contact: { email: " a@example.test ", firstName: " A ", lastName: " B ", phone: "9876543210" }, shipping: address, billing: address, business: " ", gstin: "" };
const request = { ...base, expectedTestTotalPaise: 21800, testPolicyVersion: "local-test-v1" };
const json = (value, status = 200) => Response.json(value, { status });
const error = (code, status) => json({ error: { code } }, status);

function storefrontHarness({ settings = env, body = { value: { items: [item] } }, rpcResult = { data: { policyVersion: "local-test-v1" }, error: null }, throws = false } = {}) {
  const exports = {}, calls = [];
  const deps = { "server-only": {}, "@/lib/insforge/public": { createInsforgePublicClient: () => ({ database: { schema: () => ({ rpc: async (name, args) => { calls.push({ name, args }); if (throws) throw Error("secret backend detail"); return rpcResult; } }) } }) }, "@/app/api/cart/http": { cartError: error, cartJson: json, readCartBody: async () => body }, "@/lib/cart/validation": { parseCartQuoteRequest }, "./storefront-test-validation": { storefrontTestEnabled } };
  runInNewContext(quoteSource, { exports, Response, process: { env: settings }, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; } });
  return { ...exports, calls };
}
function paymentHarness({ settings = env, body = { value: request }, ownerError = null } = {}) {
  const exports = {}, calls = [], captured = [];
  const deps = { "server-only": {}, "@clerk/nextjs/server": { auth: async () => ({ isAuthenticated: true, sessionStatus: "active", userId: "user-a" }) }, "@/lib/checkout/http": { cartError: error, cartJson: json, checkoutOwnerError: async () => ownerError, readCheckoutBody: async () => body }, "@/lib/checkout/validation": { parseSimulationRequest }, "./storefront-test-validation": { parseStorefrontTestRequest, storefrontTestEnabled }, "./test-deployment": { localRazorpayTestEnabled }, "@/lib/insforge/server": { createInsforgeServerClient: async () => ({ payments: { razorpay: {} }, database: { schema: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { state: "creating" }, error: null }; } }) } }) }, "./razorpay-test-core": { prepareTest: async (rpc, _provider, input, proof, key, subject) => { captured.push({ input, proof, key, subject }); await rpc("razorpay_test_prepare", { p_request: input }); return { state: "creating" }; }, TestConnectionChanged: class extends Error {} } };
  runInNewContext(paymentSource, { exports, Response, URL, process: { env: settings }, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; } });
  return { ...exports, calls, captured };
}

test("storefront gate requires development, loopback, both flags, proof and test key before any RPC", async () => {
  const cases = [ [url, { ...env, NODE_ENV: "production" }], ["https://example.test/quote", env], [url, { ...env, PANDABYTE_STOREFRONT_TEST_ENABLED: "false" }], [url, { ...env, PANDABYTE_RAZORPAY_TEST_ENABLED: "false" }], [url, { ...env, RAZORPAY_CHECKOUT_TEST_KEY: "" }], [url, { ...env, RAZORPAY_TEST_KEY_ID: "rzp_live_123" }] ];
  for (const [location, settings] of cases) {
    const h = storefrontHarness({ settings }); const req = new Request(location);
    assert.equal(storefrontTestEnabled(req, settings), false);
    assert.equal(await h.storefrontTestCapabilities(req), null);
    assert.equal((await h.storefrontTestQuote(req)).status, 503);
    assert.equal(h.calls.length, 0);
  }
});
test("guest capabilities use policy RPC only and route does not fall back when enabled", async () => {
  const h = storefrontHarness(), req = new Request(url);
  const response = await h.storefrontTestCapabilities(req);
  assert.deepEqual(await response.json(), { razorpayTestAvailable: true, fictionalShippingPaise: 0, fictionalTaxPaise: 0, storefrontTest: true });
  assert.deepEqual(h.calls.map(c => c.name), ["storefront_test_policy"]);
  const exports = {}; let fallback = 0;
  runInNewContext(capabilitiesSource, { exports, require: name => name === "@/lib/checkout/storefront-test" ? { storefrontTestCapabilities: h.storefrontTestCapabilities } : { razorpayTestRoute: async () => { fallback++; return json({}); } } });
  assert.equal((await exports.GET(req)).status, 200); assert.equal(fallback, 0);
});
test("quote propagates origin/body rejections and validates empty, duplicate and malformed items before RPC", async () => {
  for (const status of [403, 413, 415]) { const h = storefrontHarness({ body: error("blocked", status) }); assert.equal((await h.storefrontTestQuote(new Request(url))).status, status); assert.equal(h.calls.length, 0); }
  for (const value of [{ items: [] }, { items: [item, item] }, { items: [{ ...item, quantity: 0 }] }, { items: [item], extra: true }]) { const h = storefrontHarness({ body: { value } }); assert.equal((await h.storefrontTestQuote(new Request(url))).status, 400); assert.equal(h.calls.length, 0); }
  const h = storefrontHarness(); await h.storefrontTestQuote(new Request(url));
  assert.deepEqual(h.calls[0].args.p_items, [item]); assert.equal(h.calls[0].name, "storefront_test_quote");
});
test("backend errors do not disclose details or enable capability", async () => {
  const h = storefrontHarness({ throws: true });
  const quote = await h.storefrontTestQuote(new Request(url)); assert.equal(quote.status, 503); assert.doesNotMatch(await quote.text(), /secret backend detail/);
  assert.deepEqual(await (await h.storefrontTestCapabilities(new Request(url))).json(), { razorpayTestAvailable: false });
});
test("storefront prepare sanitizes permitted values and rejects added fields or bad policy/amount", async () => {
  const parsed = parseStorefrontTestRequest(request); assert.equal(parsed.contact.email, "a@example.test"); assert.equal(parsed.shipping.line1, "Road");
  for (const patch of [{ extra: true }, { expectedTestTotalPaise: 99 }, { expectedTestTotalPaise: 1.5 }, { testPolicyVersion: "old" }, { items: [item, item] }]) assert.equal(parseStorefrontTestRequest({ ...request, ...patch }), null);
  const h = paymentHarness(); const response = await h.razorpayTestRoute(new Request(url), "prepare");
  assert.equal(response.status, 200); assert.equal(h.calls[0].name, "razorpay_storefront_test_prepare");
  assert.deepEqual(h.captured[0].input, parsed); assert.equal(h.captured[0].input.expectedTestTotalPaise, 21800); assert.equal(h.captured[0].input.testPolicyVersion, "local-test-v1");
  const denied = paymentHarness({ body: { value: { ...request, injected: true } } }); assert.equal((await denied.razorpayTestRoute(new Request(url), "prepare")).status, 400); assert.equal(denied.calls.length, 0);
  const origin = paymentHarness({ ownerError: error("same_origin_required", 403) }); assert.equal((await origin.razorpayTestRoute(new Request(url), "prepare")).status, 403); assert.equal(origin.calls.length, 0);
  const invalidBody = paymentHarness({ body: error("invalid_json", 400) }); assert.equal((await invalidBody.razorpayTestRoute(new Request(url), "prepare")).status, 400); assert.equal(invalidBody.calls.length, 0);
  for (const settings of [{ ...env, NODE_ENV: "production" }, { ...env, RAZORPAY_TEST_KEY_ID: "rzp_live_1" }, { ...env, RAZORPAY_CHECKOUT_TEST_KEY: "" }]) { const disabled = paymentHarness({ settings }); assert.equal((await disabled.razorpayTestRoute(new Request(url), "prepare")).status, 503); assert.equal(disabled.calls.length, 0); }
});
test("legacy fixture prepare keeps old request shape and RPC", async () => {
  const h = paymentHarness({ settings: { ...env, PANDABYTE_STOREFRONT_TEST_ENABLED: "false" }, body: { value: base } });
  assert.equal((await h.razorpayTestRoute(new Request(url), "prepare")).status, 200);
  assert.equal(h.calls[0].name, "razorpay_test_prepare"); assert.deepEqual(h.captured[0].input, parseSimulationRequest(base));
  const denied = paymentHarness({ settings: { ...env, PANDABYTE_STOREFRONT_TEST_ENABLED: "false" }, body: { value: request } }); assert.equal((await denied.razorpayTestRoute(new Request(url), "prepare")).status, 400); assert.equal(denied.calls.length, 0);
});

test("hosted checkout requires production deployment, explicit test flags, fixed HTTPS origin and test credentials", async () => {
  const hosted = { ...env, NODE_ENV: "production", VERCEL_ENV: "production", PANDABYTE_HOSTED_TEST_ENABLED: "true" };
  const hostUrl = "https://pandabyte-iot.vercel.app/api/checkout/razorpay-test/quote";
  const req = new Request(hostUrl);
  assert.equal(hostedStorefrontTestEnabled(req, hosted), true);
  assert.equal(storefrontTestEnabled(req, hosted), true);
  const h = paymentHarness({ settings: hosted });
  assert.equal((await h.razorpayTestRoute(req, "prepare")).status, 200);
  assert.equal(h.calls[0].name, "razorpay_storefront_test_prepare");
  const negatives = [
    [hostUrl, { ...hosted, VERCEL_ENV: "preview" }],
    [hostUrl, { ...hosted, VERCEL_ENV: undefined }],
    [hostUrl, { ...hosted, PANDABYTE_HOSTED_TEST_ENABLED: "false" }],
    [hostUrl, { ...hosted, PANDABYTE_STOREFRONT_TEST_ENABLED: "false" }],
    [hostUrl, { ...hosted, PANDABYTE_RAZORPAY_TEST_ENABLED: "false" }],
    [hostUrl, { ...hosted, RAZORPAY_TEST_KEY_ID: "rzp_live_123" }],
    [hostUrl, { ...hosted, RAZORPAY_CHECKOUT_TEST_KEY: "short" }],
    ["http://pandabyte-iot.vercel.app/api", hosted],
    ["https://pandabyte-iot.vercel.app:444/api", hosted],
    ["https://evil.test/api", hosted],
  ];
  for (const [location, settings] of negatives) {
    const denied = paymentHarness({ settings, body: { value: base } });
    const badRequest = new Request(location, { headers: { host: "pandabyte-iot.vercel.app", "x-forwarded-host": "pandabyte-iot.vercel.app", "x-forwarded-proto": "https" } });
    assert.equal(hostedStorefrontTestEnabled(badRequest, settings), false);
    assert.equal((await denied.razorpayTestRoute(badRequest, "prepare")).status, 503);
    assert.equal(denied.calls.length, 0);
  }
  const fixture = paymentHarness({ settings: hosted, body: { value: base } });
  assert.equal((await fixture.razorpayTestRoute(req, "prepare")).status, 400);
  assert.equal(fixture.calls.length, 0);
});

test("hosted CSP opens Razorpay only on the exact enabled test deployment", () => {
  const hosted = { ...env, NODE_ENV: "production", VERCEL_ENV: "production", PANDABYTE_HOSTED_TEST_ENABLED: "true" };
  function policy(requestUrl, settings) {
    const exports = {};
    const deps = { "@clerk/nextjs/server": { clerkMiddleware: (_handler, options) => options }, "./lib/checkout/test-deployment": { hostedStorefrontTestEnabled } };
    runInNewContext(proxySource, { exports, process: { env: settings }, require: name => { if (!(name in deps)) throw Error(name); return deps[name]; } });
    return exports.default(new Request(requestUrl)).contentSecurityPolicy.directives;
  }
  const origin = "https://pandabyte-iot.vercel.app/checkout";
  const allowed = policy(origin, hosted);
  assert.ok(allowed["script-src"].includes("https://checkout.razorpay.com"));
  assert.ok(allowed["frame-src"].includes("https://api.razorpay.com"));
  assert.ok(allowed["connect-src"].includes("https://checkout.razorpay.com"));
  for (const [requestUrl, settings] of [[origin, { ...hosted, VERCEL_ENV: "preview" }], [origin, { ...hosted, PANDABYTE_HOSTED_TEST_ENABLED: "false" }], ["https://other.example/checkout", hosted], [origin, { ...hosted, RAZORPAY_TEST_KEY_ID: "rzp_live_1" }]]) {
    const denied = policy(requestUrl, settings);
    assert.equal(denied["script-src"], undefined);
    assert.ok(!denied["frame-src"].includes("https://checkout.razorpay.com"));
    assert.ok(!denied["connect-src"].includes("https://api.razorpay.com"));
  }
});
