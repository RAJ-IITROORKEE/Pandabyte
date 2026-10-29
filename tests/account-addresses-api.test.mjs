import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as addresses from "../lib/account/addresses.ts";

const compiled = file => ts.transpileModule(readFileSync(new URL(`../app/api/account/addresses/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const listCode = compiled("route.ts"), itemCode = compiled("[id]/route.ts");
const id = "7ae11111-2222-4333-8444-555555555555";
const address = { label: "Home", recipientName: "Example Customer", phone: "", line1: "Example street", line2: "", city: "Example city", state: "Example state", postalCode: "001234", country: "IN", isDefaultShipping: true, isDefaultBilling: true };
function harness(session = { userId: "customer-b" }) {
  const calls = [], list = {}, item = {};
  const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
  const http = {
    activeCustomerSession: async () => session,
    addressError: (code, status) => json({ error: { code } }, status), addressJson: json,
    readAddressBody: async request => { calls.push(["body"]); return { value: await request.json() }; },
    customerAddressRpc: async (name, args) => { calls.push([name, args]); return { data: name === "customer_list_addresses" ? [] : name === "customer_delete_address" ? { deleted: true } : { ...address, id, version: 1 } }; },
  };
  const require = name => {
    if (name === "./http" || name === "../http") return http;
    if (name === "@/lib/account/addresses") return addresses;
    throw Error(`Unexpected import ${name}`);
  };
  runInNewContext(listCode, { exports: list, require, Response });
  runInNewContext(itemCode, { exports: item, require, Response });
  return { ...list, ...item, calls };
}
const context = { params: Promise.resolve({ id }) };
const request = (method, owner) => new Request("http://localhost/api/account/addresses", { method, headers: { "content-type": "application/json", ...(owner ? { "x-account-owner": owner } : {}) }, body: JSON.stringify(method === "DELETE" ? { expectedVersion: 1 } : method === "PATCH" ? { ...address, expectedVersion: 1 } : address) });

test("address mutations reject missing or previous owner before reading bodies or calling RPCs", async () => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    for (const owner of [undefined, "customer-a"]) {
      const h = harness();
      const response = await h[method](request(method, owner), context);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: { code: "account_changed" } });
      assert.match(response.headers.get("cache-control"), /private, no-store/);
      assert.equal(h.calls.length, 0);
    }
    const h = harness(null);
    assert.equal((await h[method](request(method, "customer-b"), context)).status, 401);
    assert.equal(h.calls.length, 0);
  }
});

test("matching address owner keeps versioned mutations and header-free GET compatible", async () => {
  for (const [method, rpc] of [["POST", "customer_create_address"], ["PATCH", "customer_update_address"], ["DELETE", "customer_delete_address"]]) {
    const h = harness();
    const response = await h[method](request(method, "customer-b"), context);
    assert.equal(response.status, method === "POST" ? 201 : 200);
    const call = h.calls.find(entry => entry[0] === rpc);
    assert.ok(call);
    assert.equal(Object.hasOwn(call[1], "user_id"), false);
    if (method !== "POST") { assert.equal(call[1].p_id, id); assert.equal(call[1].p_expected_version, 1); }
  }
  const h = harness();
  const response = await h.GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { addresses: [] });
});
