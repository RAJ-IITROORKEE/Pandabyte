import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parseBillingProfile } from "../lib/account/billing-profile.ts";

const require = createRequire(import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const billingCompiled = compile("billing-profile-form.tsx");
const overviewCompiled = compile("account-overview-extras.tsx");
const flush = () => new Promise(resolve => setImmediate(resolve));
const profile = { version: 4, businessName: "Example Workshop", contactEmail: "billing@example.com", gstin: "" };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function harness(kind) {
  let identity = { isLoaded: true, user: { id: "customer-a" } }, mounted, active, cursor, tree;
  const requests = [], events = new Map(), exports = {};
  const hooks = {
    useState(initial) {
      const slot = active.slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }];
    },
    useEffect(effect, deps) {
      const slot = active.slots[cursor++] ??= {};
      if (!slot.deps || deps.some((value, index) => !Object.is(value, slot.deps[index]))) {
        slot.deps = deps;
        active.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  runInNewContext(kind === "billing" ? billingCompiled : overviewCompiled, {
    exports, AbortController,
    window: { addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); } },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
    require(name) {
      if (name === "react") return hooks;
      if (name === "@clerk/nextjs") return { useUser: () => identity };
      if (name === "@/lib/account/billing-profile") return { parseBillingProfile };
      if (name === "next/link") return { default: ({ children, ...props }) => createElement("a", props, children) };
      if (name.endsWith(".module.css")) return { default: {} };
      return require(name);
    },
  });
  function unmount() {
    mounted?.slots.forEach(slot => slot.cleanup?.());
    mounted = undefined;
  }
  function render(userId = identity.user?.id) {
    const root = kind === "billing" ? exports.BillingProfileForm() : createElement(exports.AccountOverviewExtras, { key: userId, userId });
    if (typeof root.type !== "function") { unmount(); tree = root; return tree; }
    if (!mounted || mounted.key !== root.key) { unmount(); mounted = { key: root.key, slots: [], effects: [] }; }
    active = mounted; cursor = 0; mounted.effects = [];
    tree = root.type(root.props);
    mounted.effects.forEach(effect => effect());
    return tree;
  }
  function find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, "Expected control is rendered"); return node; }
  return {
    requests, render, unmount, html: () => renderToStaticMarkup(tree),
    identity(value) { identity = value; },
    key: () => kind === "billing" ? exports.BillingProfileForm().key : mounted?.key,
    focus: () => events.get("focus")?.(),
    change(index, value) { nodes(tree).filter(node => node.type === "input")[index].props.onChange({ target: { value } }); },
    submit: () => find(node => node.type === "form").props.onSubmit({ preventDefault() {} }),
    reload: () => find(node => node.type === "button" && node.props.children === "Reload saved details").props.onClick(),
  };
}

async function loadBilling(h) {
  h.render();
  h.requests[0].resolve(response({ billingProfile: profile }));
  await flush(); h.render();
}

test("billing gates private fields and replaces the customer subtree on identity changes", async () => {
  const h = harness("billing");
  h.identity({ isLoaded: false, user: { id: "customer-a" } }); h.render();
  assert.match(h.html(), /Loading billing access/);
  assert.equal(h.requests.length, 0);
  h.identity({ isLoaded: true, user: null }); h.render();
  assert.match(h.html(), /Sign in to manage billing details/);
  h.identity({ isLoaded: true, user: { id: "customer-a" } }); h.render();
  assert.equal(h.key(), "customer-a");
  h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render();
  assert.equal(h.key(), "customer-b");
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(response({ billingProfile: profile }));
  await flush(); h.render();
  assert.doesNotMatch(h.html(), /Example Workshop|billing@example.com/);
  assert.match(h.html(), /Loading billing details/);
  h.requests[1].resolve(response({ billingProfile: { ...profile, businessName: "Other Workshop", contactEmail: "other@example.com" } }));
  await flush(); h.render();
  assert.match(h.html(), /Other Workshop/);
  assert.doesNotMatch(h.html(), /Example Workshop|billing@example.com/);
  h.unmount();
});

test("billing load errors stay visible and reload aborts superseded reads", async () => {
  const h = harness("billing"); h.render();
  assert.match(h.html(), /Loading billing details/);
  h.requests[0].resolve(response({}, 503)); await flush(); h.render();
  assert.match(h.html(), /role="alert".*Billing details could not be loaded/);
  assert.doesNotMatch(h.html(), /<form|saved to your account/);
  h.reload(); h.render();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[1].resolve(response({ billingProfile: profile })); await flush(); h.render();
  assert.match(h.html(), /Example Workshop/);
  assert.doesNotMatch(h.html(), /could not be loaded/);
  h.unmount();
});

test("billing sends owner and current version, confirms saves and clears success when edited", async () => {
  const h = harness("billing"); await loadBilling(h);
  assert.equal(h.requests[0].options.headers["x-account-owner"], "customer-a");
  assert.match(h.html(), /Save billing details<\/button>/);
  h.change(0, "Changed Workshop"); h.render();
  assert.match(h.html(), /Unsaved changes/);
  h.submit(); h.render();
  const put = h.requests[1];
  assert.equal(put.options.method, "PUT");
  assert.equal(put.options.cache, "no-store");
  assert.equal(put.options.headers["x-account-owner"], "customer-a");
  assert.deepEqual(JSON.parse(put.options.body), { expectedVersion: 4, businessName: "Changed Workshop", contactEmail: profile.contactEmail, gstin: "" });
  assert.match(h.html(), /Saving…/);
  assert.doesNotMatch(h.html(), /Billing details saved to your account/);
  put.resolve(response({ billingProfile: { ...profile, version: 5, businessName: "Changed Workshop" } }));
  await flush(); h.render();
  assert.match(h.html(), /Billing details saved to your account/);
  assert.doesNotMatch(h.html(), /Unsaved changes/);
  h.change(1, "changed@example.com"); h.render();
  assert.match(h.html(), /Unsaved changes/);
  assert.doesNotMatch(h.html(), /Billing details saved to your account/);
  h.submit();
  assert.equal(JSON.parse(h.requests[2].options.body).expectedVersion, 5);
  h.requests[2].resolve(response({}, 503)); await flush(); h.unmount();
});

test("billing preserves unsaved entries and never confirms a rejected or malformed save", async () => {
  for (const outcome of [response({}, 400), response({}, 409), response({}, 503), response({ billingProfile: { ...profile, unexpected: "private" } })]) {
    const h = harness("billing"); await loadBilling(h);
    h.change(0, "Keep my entry"); h.render(); h.submit();
    h.requests[1].resolve(outcome); await flush(); h.render();
    assert.match(h.html(), /Keep my entry/);
    assert.match(h.html(), /role="alert"/);
    assert.match(h.html(), /Unsaved changes/);
    assert.doesNotMatch(h.html(), /Billing details saved to your account/);
    h.unmount();
  }
});

test("overview distinguishes failed and malformed account sources from real empty data", async () => {
  for (const outcomes of [[response({}, 503), response({}, 503), response({}, 503)], [response({ addresses: [{}] }), response({ profile: {} }), response({ total: "0" })]]) {
    const h = harness("overview"); h.render("customer-a");
    assert.match(h.html(), /Loading address summary|Loading account summary/);
    outcomes.forEach((result, index) => h.requests[index].resolve(result));
    await flush(); h.render("customer-a");
    assert.match(h.html(), /Address summary is unavailable/);
    assert.match(h.html(), /Contact phone: Unavailable/);
    assert.match(h.html(), /Active order count unavailable/);
    assert.doesNotMatch(h.html(), /0 saved addresses|0 active orders|Contact phone: Not set/);
    h.unmount();
  }
  const h = harness("overview"); h.render("customer-a");
  [{ addresses: [] }, { profile: null }, { total: 0 }].forEach((body, index) => h.requests[index].resolve(response(body)));
  await flush(); h.render("customer-a");
  assert.match(h.html(), /0 saved addresses/);
  assert.match(h.html(), /0 active orders/);
  assert.match(h.html(), /Contact phone: Not set/);
  h.unmount();
});

test("overview aborts old reads on focus refresh and keyed account remount", async () => {
  const h = harness("overview"); h.render("customer-a");
  const first = h.requests.slice();
  h.focus();
  assert.ok(first.every(request => request.options.signal.aborted));
  h.render("customer-b");
  assert.ok(h.requests.slice(3, 6).every(request => request.options.signal.aborted));
  for (const [index, body] of [{ addresses: [{ label: "Private A", recipientName: "Private A", line1: "Private street", city: "Private city", isDefaultShipping: true, isDefaultBilling: true }] }, { profile: { phone: "1111111111" } }, { total: 9 }].entries()) {
    first[index].resolve(response(body)); h.requests[index + 3].resolve(response(body));
  }
  await flush(); h.render("customer-b");
  assert.doesNotMatch(h.html(), /Private A|Private street|1111111111|9 active orders/);
  [{ addresses: [] }, { profile: { phone: "2222222222" } }, { total: 2 }].forEach((body, index) => h.requests[index + 6].resolve(response(body)));
  await flush(); h.render("customer-b");
  assert.match(h.html(), /2222222222.*unverified/);
  assert.match(h.html(), /2 active orders/);
  h.unmount();
  assert.equal(h.requests[6].options.signal.aborted, true);
});

test("the real account overview keys its private summary by the active customer", () => {
  let user = { id: "customer-a" };
  const exports = {}, Summary = () => null;
  runInNewContext(compile("account-dashboard.tsx"), { exports, require(name) {
    if (name === "react") return { useEffect() {} };
    if (name === "@clerk/nextjs") return { useUser: () => ({ user }) };
    if (name === "@/components/account-overview-extras") return { AccountOverviewExtras: Summary };
    if (name === "@/components/favorites/use-favorites") return { useFavorites: () => ({ items: [], loading: false }) };
    if (name === "@/components/account-orders") return { useAccountOrders: () => ({ orders: { items: [], total: 0 } }) };
    if (name.endsWith(".module.css")) return { default: {} };
    if (name.startsWith("@/components/")) return {};
    return require(name);
  } });
  for (const id of ["customer-a", "customer-b"]) {
    user = { id };
    const dashboard = exports.AccountDashboard({ section: "overview" });
    const overview = nodes(dashboard).find(node => node.type?.name === "AccountOverview");
    assert.ok(overview);
    const summary = nodes(overview.type(overview.props)).find(node => node.type === Summary);
    assert.equal(summary?.key, id);
    assert.equal(summary?.props.userId, id);
  }
});
