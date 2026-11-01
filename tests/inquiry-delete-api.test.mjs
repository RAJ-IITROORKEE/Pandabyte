import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "../lib/editorial/validation.ts";
import * as storageHttp from "../lib/storage/http.ts";

const source = (file) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const route = source("../app/api/admin/inquiries/[id]/route.ts");
const http = source("../lib/editorial/http.ts");
const id = "00000000-0000-4000-8000-000000000001";

function harness({ access = { allowed: true }, rpcResult = { data: { deleted: true }, error: null }, unavailable = false } = {}) {
  const calls = [], httpExports = {}, routeExports = {};
  const client = async () => {
    calls.push("client");
    if (unavailable) throw Error("private backend detail");
    return { database: { schema: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return rpcResult; } }) } };
  };
  runInNewContext(http, { exports: httpExports, Response, TextDecoder, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/authorization") return { requireCapability: async (capability) => { assert.equal(capability, "inquiries.manage"); return access; } };
    if (name === "@/lib/insforge/server") return { createInsforgeServerClient: client };
    if (name === "@/lib/storage/http") return storageHttp;
    if (name === "@/lib/observability/events") return { operationalJson: (value, status, headers) => Response.json(value, { status, headers }) };
    throw Error(`Unexpected HTTP import ${name}`);
  } });
  runInNewContext(route, { exports: routeExports, Response, require(name) {
    if (name === "@/lib/editorial/http") return httpExports;
    if (name === "@/lib/editorial/validation") return validation;
    if (name === "@/lib/insforge/server") return { createInsforgeServerClient: client };
    if (name === "@/lib/contact/notifications") return { notificationSettings: () => null };
    throw Error(`Unexpected route import ${name}`);
  } });
  return { remove: (request, selectedId = id) => routeExports.DELETE(request, { params: Promise.resolve({ id: selectedId }) }), calls };
}

function request(value = { expectedVersion: 3 }, { origin = "http://localhost:3000", contentType = "application/json", raw } = {}) {
  return new Request(`http://localhost:3000/api/admin/inquiries/${id}`, {
    method: "DELETE", headers: { ...(origin === null ? {} : { origin }), "content-type": contentType }, body: raw ?? JSON.stringify(value),
  });
}

test("inquiry deletion rejects anonymous or unauthorized staff before database access", async () => {
  for (const status of [401, 403, 503]) {
    const h = harness({ access: { allowed: false, status } });
    const response = await h.remove(request());
    assert.equal(response.status, status);
    assert.equal(h.calls.length, 0);
  }
});

test("inquiry deletion requires same-origin bounded JSON and one positive expected version", async () => {
  for (const [req, status, selectedId] of [
    [request(), 404, "bad-id"], [request({}, { origin: null }), 403],
    [request({}, { origin: "https://other.example" }), 403], [request({}, { contentType: "text/plain" }), 415],
    [request({}, { raw: "{" }), 400], [request({}, { raw: " ".repeat(1025) }), 413],
    ...[{}, { expectedVersion: 0 }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: "3" }, { expectedVersion: 3, permanent: true }, { expectedVersion: Number.MAX_SAFE_INTEGER + 1 }].map(value => [request(value), 400]),
  ]) {
    const h = harness();
    assert.equal((await h.remove(req, selectedId)).status, status);
    assert.equal(h.calls.length, 0);
  }
});

test("inquiry deletion calls only the versioned soft-delete RPC and returns private confirmation", async () => {
  const h = harness();
  const response = await h.remove(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(h.calls[1].name, "admin_delete_inquiry");
  assert.deepEqual({ ...h.calls[1].args }, { p_id: id, p_expected_version: 3 });
  assert.equal(h.calls.length, 2);
});

test("inquiry deletion preserves conflicts/missing results and fails closed on unknown outcomes", async () => {
  for (const [details, status] of [["version_conflict", 409], ["inquiry_not_found", 404], ["forbidden", 403]]) {
    const h = harness({ rpcResult: { data: null, error: { details } } });
    assert.equal((await h.remove(request())).status, status);
  }
  for (const options of [{ unavailable: true }, { rpcResult: { data: null, error: null } }]) {
    const response = await harness(options).remove(request());
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(await response.json()).includes("private backend detail"), false);
  }
});
