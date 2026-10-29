import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as profile from "../lib/account/profile.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../app/api/account/profile/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function harness(session = { isAuthenticated: true, sessionStatus: "active", userId: "customer-b" }) {
  const exports = {}, calls = [];
  const record = { display_name: "", phone: "1234567", created_at: "2026-10-28T00:00:00Z" };
  const chain = {
    update(values) { calls.push(["update", values]); return chain; },
    eq(field, value) { calls.push(["eq", field, value]); return chain; },
    select() { return chain; },
    limit: async () => ({ data: [record], error: null }),
    then(resolve) { return Promise.resolve({ data: [record], error: null }).then(resolve); },
  };
  runInNewContext(compiled, { exports, Response, TextDecoder, require(name) {
    if (name === "@clerk/nextjs/server") return { auth: async () => session };
    if (name === "@/lib/account/profile") return profile;
    if (name === "@/lib/observability/events") return { operationalJson: (body, status, headers) => Response.json(body, { status, headers }) };
    if (name === "@/lib/insforge/server") return { createInsforgeServerClient: async () => { calls.push(["client"]); return { database: { schema: () => ({ from: () => chain }) } }; } };
    throw Error(`Unexpected import ${name}`);
  } });
  return { ...exports, calls };
}
const request = owner => new Request("http://localhost/api/account/profile", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json", ...(owner ? { "x-account-owner": owner } : {}) }, body: JSON.stringify({ phone: "1234567" }) });

test("profile PATCH rejects a missing or previous account before database access", async () => {
  for (const owner of [undefined, "customer-a"]) {
    const h = harness();
    const response = await h.PATCH(request(owner));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "account_changed" });
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness({ isAuthenticated: false });
  assert.equal((await h.PATCH(request("customer-b"))).status, 401);
  assert.equal(h.calls.length, 0);
});

test("profile PATCH still targets only the authenticated subject when expected owner matches", async () => {
  const h = harness();
  assert.equal((await h.PATCH(request("customer-b"))).status, 200);
  const eq = h.calls.find(call => call[0] === "eq");
  assert.deepEqual(eq, ["eq", "user_id", "customer-b"]);
  assert.deepEqual({ ...h.calls.find(call => call[0] === "update")[1] }, { phone: "1234567" });
});

test("profile GET remains compatible without an expected-owner header", async () => {
  const h = harness();
  const response = await h.GET();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.phone, "1234567");
});
