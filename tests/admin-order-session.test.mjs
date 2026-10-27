import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/admin/order-detail.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness() {
  let identity = { isLoaded: true, user: { id: "a" } }, effect, resolve, cursor = 0;
  const state = [], exports = {};
  const deps = {
    "@clerk/nextjs": { useUser: () => identity },
    react: { useState(initial) { const i = cursor++; state[i] = initial; return [initial, value => { state[i] = value; }]; }, useEffect(callback) { effect = callback; } },
    "@/components/admin/admin-shell": { useAdminCapabilities: () => ["staff.manage"] },
    "@/components/admin/record-screens": { AdminAccessDeniedScreen: () => null },
    "next/link": { default: () => null },
    "./admin-ui.module.css": { default: {} }, "./order-detail.module.css": { default: {} },
  };
  runInNewContext(compiled + "\nexports.Session = OrderDetailSession;", {
    exports, require: name => deps[name] ?? require(name), AbortController,
    fetch: () => new Promise(done => { resolve = done; }),
  });
  return { exports, state, identity: value => { identity = value; }, effect: () => effect(), resolve: value => resolve(value) };
}
test("Admin order changes replace private state for both reference and active account", () => {
  const h = harness();
  const first = h.exports.AdminOrderDetail({ reference: "SIM-first" });
  const next = h.exports.AdminOrderDetail({ reference: "SIM-second" });
  assert.notEqual(first.key, next.key);
  h.identity({ isLoaded: true, user: { id: "b" } });
  assert.notEqual(next.key, h.exports.AdminOrderDetail({ reference: "SIM-second" }).key);
  h.identity({ isLoaded: false, user: { id: "b" } });
  assert.equal(h.exports.AdminOrderDetail({ reference: "SIM-second" }).type, "p");
  h.identity({ isLoaded: true, user: null });
  assert.notEqual(h.exports.AdminOrderDetail({ reference: "SIM-second" }).type, first.type);
});
test("an aborted Admin order response cannot populate a later detail session", async () => {
  const h = harness();
  h.exports.Session({ reference: "SIM-first" });
  const cleanup = h.effect();
  cleanup();
  h.resolve({ ok: true, json: async () => ({ reference: "SIM-first", status: "pending", snapshot: { shipment: {} } }) });
  await new Promise(done => setImmediate(done));
  assert.equal(h.state[0], null);
});
