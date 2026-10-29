import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = kind => ts.transpileModule(readFileSync(new URL(`../components/account-${kind}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const result = (phone, status = 200) => ({ ok: status === 200, status, json: async () => ({ profile: { display_name: "", phone, created_at: "2026-10-28T00:00:00Z" } }) });
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function harness(kind = "profile") {
  let identity = { isLoaded: true, user: { id: "customer-a" } }, mounted, active, cursor, tree;
  const requests = [], exports = {};
  const hooks = {
    useState(initial) { const slot = active.slots[cursor++] ??= { value: initial }; return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }]; },
    useRef(initial) { const slot = active.slots[cursor++] ??= { current: initial }; return slot; },
    useCallback(callback, deps) { const slot = active.slots[cursor++] ??= {}; if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps[i]))) { slot.deps = deps; slot.callback = callback; } return slot.callback; },
    useEffect(effect, deps) { const slot = active.slots[cursor++] ??= {}; if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps[i]))) { slot.deps = deps; active.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); }); } },
  };
  runInNewContext(compiled(kind), { exports, AbortController, queueMicrotask, fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })), require(name) {
    if (name === "react") return hooks;
    if (name === "@clerk/nextjs") return { useUser: () => identity };
    if (name.endsWith(".module.css")) return { default: {} };
    return require(name);
  } });
  function unmount() { mounted?.slots.forEach(slot => slot.cleanup?.()); mounted = undefined; }
  function render() {
    const root = kind === "profile" ? exports.AccountProfile() : exports.AccountAddresses();
    if (typeof root.type !== "function") { unmount(); tree = root; return; }
    if (!mounted || mounted.key !== root.key) { unmount(); mounted = { key: root.key, slots: [], effects: [] }; }
    active = mounted; cursor = 0; mounted.effects = []; tree = root.type(root.props); mounted.effects.forEach(effect => effect());
  }
  function find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, "Expected profile control"); return node; }
  return {
    requests, render, unmount, identity(value) { identity = value; }, html: () => renderToStaticMarkup(tree),
    edit: () => find(node => node.type === "button" && renderToStaticMarkup(node).includes("Edit details")).props.onClick(),
    button: label => find(node => node.type === "button" && (node.props["aria-label"] === label || renderToStaticMarkup(node).includes(label))).props.onClick({ currentTarget: { isConnected: true, focus() {} } }),
    change: phone => find(node => node.type === "input").props.onChange({ target: { value: phone } }),
    submit: () => find(node => node.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}

test("profile gates identity, remounts by customer, and ignores aborted private reads", async () => {
  const h = harness();
  h.identity({ isLoaded: false, user: { id: "customer-a" } }); h.render();
  assert.match(h.html(), /Loading your contact access/);
  h.identity({ isLoaded: true, user: null }); h.render();
  assert.match(h.html(), /Sign in to manage your contact details/);
  h.identity({ isLoaded: true, user: { id: "customer-a" } }); h.render(); await flush();
  h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render(); await flush();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(result("1111111111")); await flush(); h.render();
  assert.doesNotMatch(h.html(), /1111111111/);
  assert.match(h.html(), /Loading your contact details/);
  h.requests[1].resolve(result("2222222222")); await flush(); h.render();
  assert.match(h.html(), /2222222222/);
  h.unmount();
});

test("profile PATCH binds the rendered customer and aborts an in-flight save on switch", async () => {
  const h = harness(); h.render(); await flush();
  h.requests[0].resolve(result("1111111111")); await flush(); h.render();
  h.edit(); h.render(); h.change("3333333333"); h.render(); const saving = h.submit();
  const patch = h.requests[1];
  assert.equal(patch.options.method, "PATCH");
  assert.equal(patch.options.headers["x-account-owner"], "customer-a");
  assert.deepEqual(JSON.parse(patch.options.body), { phone: "3333333333" });
  h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render(); await flush();
  assert.equal(patch.options.signal.aborted, true);
  patch.resolve(result("3333333333")); await saving; h.render();
  assert.doesNotMatch(h.html(), /3333333333|Contact details saved/);
  h.requests[2].resolve(result("2222222222")); await flush(); h.render();
  assert.match(h.html(), /2222222222/);
  h.unmount();
});

test("profile account-change rejection preserves the entry without claiming a save", async () => {
  const h = harness(); h.render(); await flush();
  h.requests[0].resolve(result("1111111111")); await flush(); h.render();
  h.edit(); h.render(); h.change("3333333333"); h.render(); const saving = h.submit();
  h.requests[1].resolve(result("", 409)); await saving; h.render();
  assert.match(h.html(), /3333333333/);
  assert.match(h.html(), /Your active account changed/);
  assert.doesNotMatch(h.html(), /Contact details saved/);
  h.unmount();
});

const address = { id: "7ae11111-2222-4333-8444-555555555555", version: 1, label: "Home", recipientName: "Example Customer", phone: "", line1: "Example street", line2: "", city: "Example city", state: "Example state", postalCode: "001234", country: "IN", isDefaultShipping: true, isDefaultBilling: true };
const addressResult = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });

test("addresses remount privately and ignore aborted reads", async () => {
  const h = harness("addresses"); h.render(); await flush();
  h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render(); await flush();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(addressResult({ addresses: [address] })); await flush(); h.render();
  assert.doesNotMatch(h.html(), /Example street/);
  assert.match(h.html(), /Loading your saved addresses/);
  h.requests[1].resolve(addressResult({ addresses: [] })); await flush(); h.render();
  assert.match(h.html(), /No saved addresses yet/);
  h.unmount();
});

test("create/edit address requests bind the rendered customer and abort on switch", async () => {
  for (const method of ["POST", "PATCH"]) {
    const h = harness("addresses"); h.render(); await flush();
    h.requests[0].resolve(addressResult({ addresses: method === "PATCH" ? [address] : [] })); await flush(); h.render();
    h.button(method === "PATCH" ? "Edit Home address" : "Add address"); h.render();
    const saving = h.submit(); const request = h.requests[1];
    assert.equal(request.options.method, method);
    assert.equal(request.options.headers["x-account-owner"], "customer-a");
    if (method === "PATCH") assert.equal(JSON.parse(request.options.body).expectedVersion, 1);
    h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render(); await flush();
    assert.equal(request.options.signal.aborted, true);
    request.resolve(addressResult({ address })); await saving; h.render();
    assert.doesNotMatch(h.html(), /Example street|Address saved/);
    h.requests[2].resolve(addressResult({ addresses: [] })); await flush(); h.unmount();
  }
});

test("delete address requests retain expected version and owner and abort on switch", async () => {
  const h = harness("addresses"); h.render(); await flush();
  h.requests[0].resolve(addressResult({ addresses: [address] })); await flush(); h.render();
  h.button("Delete Home address"); h.render(); h.button("Delete address");
  const request = h.requests[1];
  assert.equal(request.options.method, "DELETE");
  assert.equal(request.options.headers["x-account-owner"], "customer-a");
  assert.deepEqual(JSON.parse(request.options.body), { expectedVersion: 1 });
  h.identity({ isLoaded: true, user: { id: "customer-b" } }); h.render(); await flush();
  assert.equal(request.options.signal.aborted, true);
  request.resolve(addressResult({ deleted: true })); await flush(); h.render();
  assert.doesNotMatch(h.html(), /Address deleted|Example street/);
  h.requests[2].resolve(addressResult({ addresses: [] })); await flush(); h.unmount();
});
