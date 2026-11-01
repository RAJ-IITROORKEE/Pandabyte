import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/admin/admin-notice.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function harness() {
  const exports = {};
  let dismissed = false;
  const dependencies = {
    react: { useState: () => [dismissed, (value) => { dismissed = value; }] },
    "lucide-react": { X: "close-icon" },
    "./admin-notice.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, require: (name) => dependencies[name] ?? require(name) });
  return exports.AdminNotice;
}

test("error dismissal keeps recovery available without clearing the failure guard", () => {
  const notice = harness();
  const failure = { conflict: true };
  let retries = 0;
  const actions = require("react").createElement("button", { onClick: () => { retries++; } }, "Reload");
  const ref = { current: null };
  const props = { tone: "error", children: "Reload required", id: "conflict", tabIndex: -1, ref, actions };
  const tree = notice(props);
  assert.equal(tree.props.role, "alert");
  assert.equal(tree.props.id, "conflict");
  assert.equal(tree.props.ref, ref);
  const close = tree.props.children[1];
  assert.equal(close.props.type, "button");
  assert.match(close.props["aria-label"], /Dismiss error/);
  close.props.onClick();
  const dismissed = notice(props);
  assert.equal(dismissed.props.role, undefined);
  assert.equal(dismissed.props.children, actions);
  dismissed.props.children.props.onClick();
  assert.equal(retries, 1);
  assert.equal(failure.conflict, true);
});

test("success dismissal clears the source notice through its callback", () => {
  const notice = harness();
  let message = "Saved";
  const tree = notice({ tone: "success", children: message, onDismiss: () => { message = ""; } });
  assert.equal(tree.props.role, "status");
  tree.props.children[1].props.onClick();
  assert.equal(message, "");
});
