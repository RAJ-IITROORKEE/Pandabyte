import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../lib/admin/orders-contract.ts";
import * as activityContract from "../lib/admin/order-activity-contract.ts";
import { isOrderReference } from "../lib/checkout/validation.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../lib/admin/orders.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ access = { allowed: true }, result = null, throws = false, rpcError = null, identities = [], users = [] } = {}) {
  const calls = [], exports = {};
  runInNewContext(compiled, { exports, URL, Response, require(name) {
    if (name === "@clerk/nextjs/server") return { clerkClient: async () => ({ users: { getUserList: async options => { assert.ok(options.userId.length <= 50); return { data: users }; } } }) };
    if (name.endsWith("orders-contract.ts")) return contract;
    if (name.endsWith("order-activity-contract.ts")) return activityContract;
    if (name === "@/lib/checkout/validation") return { isOrderReference };
    if (name === "@/lib/authorization") return { requireCapability: async capability => { assert.equal(capability, "staff.manage"); return access; } };
    if (name === "@/lib/observability/events") return { operationalJson: (body, status, headers) => Response.json(body, { status, headers }) };
    if (name === "@/lib/insforge/server") return { createInsforgeServerClient: async () => ({ database: { schema(schema) {
      assert.equal(schema, "public");
      return { rpc: async (name, args) => { calls.push({ name, args }); if (throws) throw Error("private provider data"); return { data: name === "admin_order_customer_identities" ? identities : result, error: rpcError }; } };
    } } }) };
    throw Error(`Unexpected import ${name}`);
  } });
  return { list: query => exports.adminListOrders(new Request(`http://localhost/api/admin/orders?${query}`)), activity: reference => exports.adminOrderActivity(reference), calls };
}

test("admin order list checks administrator permission before data access", async () => {
  for (const status of [401, 403, 503]) {
    const h = harness({ access: { allowed: false, status } });
    const response = await h.list("");
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.equal(h.calls.length, 0);
  }
});

test("order activity requires administrator permission and a valid reference", async () => {
  for (const status of [401, 403]) {
    const h = harness({ access: { allowed: false, status } });
    assert.equal((await h.activity("TST-11111111-1111-4111-8111-111111111111")).status, status);
    assert.equal(h.calls.length, 0);
  }
  const h = harness();
  assert.equal((await h.activity("invalid")).status, 404);
  assert.equal(h.calls.length, 0);
});

test("order activity returns a capped validated projection and keeps backend failure visible", async () => {
  const reference = "TST-11111111-1111-4111-8111-111111111111";
  const valid = { items: [{ action: "order.update", occurredAt: "2026-10-28T00:00:00.000Z", status: "fulfilled", actorLabel: "Administrator", requiresReview: null }], total: 1, limit: 50, truncated: false };
  const h = harness({ result: valid });
  const response = await h.activity(reference);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.deepEqual(await response.json(), valid);
  assert.equal(h.calls[0].name, "admin_get_order_activity");
  assert.equal(h.calls[0].args.p_reference, reference);
  for (const options of [{ result: { ...valid, items: [{ ...valid.items[0], actor: "internal-subject" }] } }, { throws: true }]) {
    assert.equal((await harness(options).activity(reference)).status, 503);
  }
  assert.equal((await harness({ rpcError: { code: "P0001", details: "not_found" } }).activity(reference)).status, 404);
});

test("invalid filters cannot invoke the order search RPC", async () => {
  const h = harness();
  const response = await h.list("environment=live");
  assert.equal(response.status, 400);
  assert.equal(h.calls.length, 0);
});

test("validated list filters reach the database and preserve complete stats scope", async () => {
  const scope = { environment: "simulation", from: "2026-10-01", to: "2026-10-28" };
  const result = { items: [], total: 0, limit: 10, offset: 20, scope, stats: { total: 9, pending: 2, active: 6, delivered: 0, cancelled: 1, exceptional: 0 } };
  const h = harness({ result });
  const response = await h.list("q=Alex&group=active&payment=simulated&environment=simulation&from=2026-10-01&to=2026-10-28&limit=10&offset=20&sort=total_desc");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.equal(h.calls[0].name, "admin_search_orders");
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0].args)), { p_query: "Alex", p_status: "all", p_sort: "total_desc", p_limit: 10, p_offset: 20, p_group: "active", p_payment: "simulated", p_environment: "simulation", p_from: "2026-10-01", p_to: "2026-10-28" });
});

test("malformed and failed backend requests remain errors instead of empty orders", async () => {
  for (const options of [{ result: { items: [], total: 0 } }, { throws: true }]) {
    const response = await harness(options).list("");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "backend_unavailable", message: "The request could not be completed. Please try again later." } });
  }
});

test("photos use bounded order identity mappings without exposing subjects or changing purchase details", async () => {
  const reference = "TST-11111111-1111-4111-8111-111111111111";
  const item = { reference, status: "processing", totalPaise: 100, currency: "INR", createdAt: "2026-10-29T00:00:00Z", updatedAt: "2026-10-29T00:00:00Z", paymentState: "paid", environment: "razorpay_test", customer: { name: "Purchased name", email: "purchase@example.test", phone: "" }, lineCount: 1, unitCount: 3 };
  const result = { items: [item], total: 1, limit: 20, offset: 0, stats: { total: 1, pending: 0, active: 1, delivered: 0, cancelled: 0, exceptional: 0 }, scope: { environment: "razorpay_test", from: "", to: "" } };
  const options = { result, identities: [{ reference, subject: "user_owner" }], users: [{ id: "user_owner", hasImage: true, imageUrl: "https://img.clerk.com/avatar" }] };
  const response = await harness(options).list("");
  const body = await response.json();
  assert.equal(body.items[0].customerAvatarUrl, "https://img.clerk.com/avatar");
  assert.deepEqual(body.items[0].customer, item.customer);
  assert.doesNotMatch(JSON.stringify(body), /user_owner/);
  const deleted = await (await harness({ ...options, users: [] }).list("")).json();
  assert.equal(deleted.items[0].customerAvatarUrl, null);
  const unsafe = await (await harness({ ...options, users: [{ id: "user_owner", hasImage: true, imageUrl: "https://untrusted.example/avatar" }] }).list("")).json();
  assert.equal(unsafe.items[0].customerAvatarUrl, null);
});
