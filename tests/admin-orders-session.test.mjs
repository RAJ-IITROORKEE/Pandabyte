import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../components/admin/orders-session.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
test("private order list is withheld until signed in and remounted for each account", () => {
  let identity = { isLoaded: false, user: null }; const exports = {};
  const deps = { "@clerk/nextjs": { useUser: () => identity }, "@/components/admin/record-screens": { AdminAccessDeniedScreen: () => null }, "./orders-screen": { AdminOrdersScreen: () => null } };
  runInNewContext(code, { exports, require: name => deps[name] ?? require(name) });
  assert.equal(exports.AdminOrdersSession().props.role, "status");
  identity = { isLoaded: true, user: null }; assert.equal(exports.AdminOrdersSession().type, deps["@/components/admin/record-screens"].AdminAccessDeniedScreen);
  identity = { isLoaded: true, user: { id: "first" } }; assert.equal(exports.AdminOrdersSession().key, "first");
  identity = { isLoaded: true, user: { id: "second" } }; assert.equal(exports.AdminOrdersSession().key, "second");
});
