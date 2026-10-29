import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/account-addresses.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const addresses = ["Home", "Work"].map((label, index) => ({
  id: String(index), version: 1, label, recipientName: "Test customer", phone: "", line1: "Test road", line2: "",
  city: "Test city", state: "Test state", postalCode: "123456", country: "IN", isDefaultShipping: false, isDefaultBilling: false,
}));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function visit(node, callback) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach(child => visit(child, callback));
  callback(node);
  visit(node.props?.children, callback);
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  return typeof node === "string" ? node : "";
}

function addressHarness() {
  const hooks = [], focused = [], refs = [];
  let cursor = 0, effects = [], tree;
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": { useUser: () => ({ isLoaded: true, user: { id: "test-customer" } }) },
    react: {
      useState: initial => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
      },
      useRef: initial => {
        const index = cursor++;
        return hooks[index] ??= { current: initial };
      },
      useCallback: (callback, deps) => {
        const index = cursor++;
        const previous = hooks[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) hooks[index] = { callback, deps };
        return hooks[index].callback;
      },
      useEffect: (callback, deps) => {
        const index = cursor++;
        const previous = hooks[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
          hooks[index] = deps;
          effects.push(callback);
        }
      },
    },
    "@/components/account.module.css": { default: {} },
  };
  runInNewContext(compiled, {
    exports, require: name => dependencies[name] ?? require(name), AbortController, queueMicrotask,
    fetch: async (_url, options) => options?.method
      ? { ok: false, status: 400 }
      : { ok: true, json: async () => ({ addresses }) },
  });
  function find(predicate) {
    let match;
    visit(tree, node => { if (!match && predicate(node)) match = node; });
    assert.ok(match, "Expected control is rendered");
    return match;
  }
  return {
    focused,
    render() {
      cursor = 0;
      effects = [];
      refs.splice(0).forEach(ref => { ref.current = null; });
      const session = exports.AccountAddresses();
      tree = session.type(session.props);
      visit(tree, node => {
        if (!node.props?.ref) return;
        const label = node.props.id ?? node.props["aria-label"] ?? node.props.children;
        node.props.ref.current = { isConnected: true, focus: () => focused.push(label) };
        refs.push(node.props.ref);
      });
      effects.forEach(effect => effect());
    },
    click(label) {
      const node = find(node => node.type === "button" && (node.props["aria-label"] === label || text(node.props.children).trim() === label));
      node.props.onClick({ currentTarget: { isConnected: true, focus: () => focused.push(label) } });
    },
    changeLabel(value) { find(node => node.props?.id === "address-label").props.onChange({ target: { value } }); },
    submit() { return find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); },
  };
}

test("address editor focuses new and selected saved addresses without interrupting typing", async () => {
  const account = addressHarness();
  account.render();
  await flush();
  account.render();
  assert.deepEqual(account.focused, []);

  account.click("Add address");
  account.render();
  assert.deepEqual(account.focused, ["address-label"]);
  account.changeLabel("New label");
  account.render();
  assert.equal(account.focused.length, 1);

  account.click("Cancel");
  account.render();
  assert.equal(account.focused.at(-1), "Add address");
  account.click("Edit Home address");
  account.render();
  assert.equal(account.focused.at(-1), "address-label");
  account.click("Edit Work address");
  account.render();
  assert.equal(account.focused.filter(label => label === "address-label").length, 3);
  account.click("Cancel");
  account.render();
  assert.equal(account.focused.at(-1), "Edit Work address");
});

test("saved-address errors retain error focus until the editor closes", async () => {
  const account = addressHarness();
  account.render();
  await flush();
  account.render();
  account.click("Edit Home address");
  account.render();
  const save = account.submit();
  account.render();
  await save;
  account.render();
  assert.deepEqual(account.focused, ["address-label", "address-form-error"]);
  account.render();
  account.changeLabel("Updated Home");
  account.render();
  assert.equal(account.focused.at(-1), "address-form-error");
  assert.equal(account.focused.length, 2);
  account.click("Cancel");
  account.render();
  assert.equal(account.focused.at(-1), "Edit Home address");
});
