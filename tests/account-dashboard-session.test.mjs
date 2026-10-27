import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/account-dashboard.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const customer = id => ({ id, fullName: `Customer ${id}`, primaryEmailAddress: { emailAddress: `${id}@example.test` } });

function dashboardHarness() {
  let identity = { isLoaded: true, user: customer("a") };
  const exports = {};
  const privateSection = name => function PrivateSection() { return createElement("p", { "data-private-section": name }, name); };
  const dependencies = {
    "@clerk/nextjs": { useUser: () => identity, useClerk: () => ({ signOut() {} }), UserAvatar: () => null },
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "lucide-react": Object.fromEntries(["CreditCard", "FolderLock", "Heart", "LayoutDashboard", "LogOut", "MapPin", "Package", "Settings", "UserRound"].map(name => [name, () => createElement("svg")])),
    react: { Suspense, useState: value => [value, () => {}], useSyncExternalStore: () => "" },
    "@/components/account-profile": { AccountProfile: privateSection("profile") },
    "@/components/account-addresses": { AccountAddresses: privateSection("addresses") },
    "@/components/account-files": { AccountFiles: privateSection("files") },
    "@/components/favorites/favorites-list": { FavoritesList: () => null },
    "@/components/favorites/favorites-store": { getFavoritesSnapshot: () => "[]", getFavoritesServerSnapshot: () => "[]", subscribeFavorites: () => () => {}, parseFavorites: () => [] },
    "@/components/account-dashboard.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name) });
  return { identity: value => { identity = value; }, render: () => exports.AccountDashboard() };
}

test("account dashboard hides private sections while identity loads or signs out", () => {
  const dashboard = dashboardHarness();
  for (const identity of [{ isLoaded: false, user: customer("a") }, { isLoaded: true, user: null }]) {
    dashboard.identity(identity);
    const html = renderToStaticMarkup(dashboard.render());
    assert.match(html, identity.isLoaded ? /role="alert".*account details could not be loaded/ : /role="status".*Loading your account/);
    assert.doesNotMatch(html, /data-private-section|Customer a|a@example\.test/);
  }
});

test("active-user changes replace the keyed subtree containing every private section", () => {
  const dashboard = dashboardHarness();
  const first = dashboard.render();
  assert.equal(first.key, "a");
  const firstHtml = renderToStaticMarkup(first);
  for (const section of ["profile", "addresses", "files"]) assert.match(firstHtml, new RegExp(`data-private-section="${section}"`));
  assert.match(firstHtml, /Customer a/);

  dashboard.identity({ isLoaded: true, user: customer("b") });
  const next = dashboard.render();
  assert.equal(next.key, "b");
  assert.notEqual(next.key, first.key);
  const nextHtml = renderToStaticMarkup(next);
  assert.match(nextHtml, /Customer b/);
  assert.doesNotMatch(nextHtml, /Customer a|a@example\.test/);
  for (const section of ["profile", "addresses", "files"]) assert.match(nextHtml, new RegExp(`data-private-section="${section}"`));
});
