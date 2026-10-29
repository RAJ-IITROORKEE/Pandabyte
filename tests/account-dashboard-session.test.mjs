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
  let section = "overview";
  let effect;
  let replacement;
  let favoritesCalls = 0;
  let orderCalls = 0;
  const window = { location: { hash: "", replace: path => { replacement = path; } }, addEventListener() {}, removeEventListener() {} };
  let identity = { isLoaded: true, user: customer("a") };
  const exports = {};
  const privateSection = name => function PrivateSection() { return createElement("p", { "data-private-section": name }, name); };
  const dependencies = {
    "@clerk/nextjs": { useUser: () => identity, useClerk: () => ({ signOut() {} }), UserAvatar: () => null },
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "lucide-react": Object.fromEntries(["CreditCard", "FolderLock", "Heart", "LayoutDashboard", "LogOut", "MapPin", "Package", "Settings", "UserRound"].map(name => [name, () => createElement("svg")])),
    react: { Suspense, useEffect: callback => { effect = callback; }, useState: value => [value, () => {}], useSyncExternalStore: () => "" },
    "@/components/account-overview-extras": { AccountOverviewExtras: () => null },
    "@/components/account-profile": { AccountProfile: privateSection("profile") },
    "@/components/account-billing": { AccountBilling: privateSection("billing") },
    "@/components/account-addresses": { AccountAddresses: privateSection("addresses") },
    "@/components/account-files": { AccountFiles: privateSection("files") },
    "@/components/favorites/favorites-list": { FavoritesList: () => null },
    "@/components/favorites/use-favorites": { useFavorites: () => { favoritesCalls++; return { items: [], account: true }; } },
    "@/components/account-orders": { useAccountOrders: id => { orderCalls++; return { orders: id ? { total: 1, owner: id, items: [] } : null, error: "" }; }, AccountOrders: ({ data }) => createElement("p", { "data-private-section": "orders" }, data.orders?.owner) },
    "@/components/account-dashboard.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, window, require: name => dependencies[name] ?? require(name) });
  return { identity: value => { identity = value; }, section: value => { section = value; }, render: () => exports.AccountDashboard({ section }), hash: value => { window.location.hash = value; }, runEffect: () => effect(), replacement: () => replacement, calls: () => ({ favoritesCalls, orderCalls }) };
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
  const firstKey = first.type(first.props).key;
  assert.equal(firstKey, "a");
  const firstHtml = renderToStaticMarkup(first);
  assert.doesNotMatch(firstHtml, /data-private-section="addresses"/);
  assert.doesNotMatch(firstHtml, /data-private-section="(?:profile|files)"/);
  assert.match(firstHtml, /Customer a/);
  dashboard.section("orders");
  assert.match(renderToStaticMarkup(dashboard.render()), /data-private-section="orders">a/);

  dashboard.identity({ isLoaded: true, user: customer("b") });
  const next = dashboard.render();
  assert.equal(next.type(next.props).key, "b");
  assert.notEqual(next.type(next.props).key, firstKey);
  const nextHtml = renderToStaticMarkup(next);
  assert.match(nextHtml, /Customer b/);
  assert.doesNotMatch(nextHtml, /Customer a|a@example\.test|data-private-section="orders">a/);
  assert.match(nextHtml, /data-private-section="orders">b/);
  assert.doesNotMatch(nextHtml, /data-private-section="addresses"|id="overview"/);
});


test("each section selects its own route and content", () => {
  const dashboard = dashboardHarness();
  for (const [section, path] of [["overview", "/account"], ["profile", "/account/profile"], ["addresses", "/account/addresses"], ["favorites", "/account/favorites"], ["orders", "/account/orders"], ["billing", "/account/billing"], ["files", "/account/files"]]) {
    dashboard.section(section);
    const html = renderToStaticMarkup(dashboard.render());
    assert.match(html, new RegExp(`href="${path}" aria-current="page"`));
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 2);
    if (["profile", "addresses", "orders", "billing", "files"].includes(section)) assert.match(html, new RegExp(`data-private-section="${section}"`));
  }
});



test("legacy account hashes redirect to the matching route", () => {
  for (const section of ["profile", "addresses", "favorites", "orders", "billing", "files"]) {
    const dashboard = dashboardHarness();
    dashboard.hash(`#${section}`);
    dashboard.render();
    dashboard.runEffect();
    assert.equal(dashboard.replacement(), `/account/${section}`);
  }
  const dashboard = dashboardHarness();
  dashboard.hash("#unknown");
  dashboard.render();
  dashboard.runEffect();
  assert.equal(dashboard.replacement(), undefined);
});


test("mobile navigation has an accessible native disclosure and current page", () => {
  const dashboard = dashboardHarness();
  dashboard.section("orders");
  const html = renderToStaticMarkup(dashboard.render());
  assert.match(html, /<details[^>]*><summary>Account navigation · Orders<\/summary>/);
  assert.match(html, /href="\/account\/orders" aria-current="page"/);
  assert.match(html, /Log out/);
});

test("only overview and orders request their data", () => {
  for (const [section, favoritesCalls, orderCalls] of [["overview", 1, 1], ["orders", 0, 1], ["profile", 0, 0], ["addresses", 0, 0], ["favorites", 0, 0], ["billing", 0, 0]]) {
    const dashboard = dashboardHarness();
    dashboard.section(section);
    renderToStaticMarkup(dashboard.render());
    assert.deepEqual(dashboard.calls(), { favoritesCalls, orderCalls });
  }
});
