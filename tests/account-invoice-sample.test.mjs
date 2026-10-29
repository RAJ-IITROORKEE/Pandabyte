import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/account-invoice-sample.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/account/invoice-sample/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/account-invoice-sample.module.css", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
const dependencies = {
  "next/image": { default: props => createElement("img", props) },
  "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
  "./account-invoice-sample.module.css": { default: {} },
};
runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name) });

test("sample clearly identifies fictional data and missing issuance configuration", () => {
  const html = renderToStaticMarkup(createElement(exports.AccountInvoiceSample));
  assert.match(html, /SAMPLE — NOT A TAX INVOICE/);
  assert.match(html, /Merchant legal details and tax configuration are missing/);
  assert.match(html, /Grand total.*Unavailable/);
  assert.match(html, /Print sample/);
  assert.match(html, /pandabyte-logo\.png/);
});

test("preview uses the account identity gate and print-safe table rules", () => {
  assert.match(page, /sessionStatus !== "active"/);
  assert.match(page, /requesting_user_id/);
  assert.match(page, /data === userId/);
  assert.match(css, /display: table-header-group/);
  assert.match(css, /break-inside: avoid/);
});
