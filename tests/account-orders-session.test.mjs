import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/account-orders.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

test("orders hide the previous account and ignore an aborted response", async () => {
  const state = [], requests = [];
  let cursor = 0, dependencies, cleanup, pendingEffect;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useEffect(effect, deps) { if (!dependencies || deps.some((value, index) => value !== dependencies[index])) { dependencies = deps; pendingEffect = effect; } },
  };
  const exports = {};
  runInNewContext(compiled, { exports, require: name => name === "react" ? hooks : name.endsWith(".module.css") ? { default: {} } : require(name), AbortController, URL, Intl,
    window: { addEventListener() {}, removeEventListener() {} },
    fetch: (url, options) => new Promise(resolve => requests.push({ url, resolve, signal: options.signal })) });
  function render(user) {
    cursor = 0;
    const value = exports.useAccountOrders(user);
    if (pendingEffect) { cleanup?.(); cleanup = pendingEffect(); pendingEffect = null; }
    return value;
  }
  const response = reference => ({ ok: true, json: async () => ({ items: [{ reference }], total: 1, limit: 20, offset: 0 }) });
  render("a");
  requests[0].resolve(response("a-private"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render("a").orders.items[0].reference, "a-private");
  assert.equal(render("b").orders, null);
  assert.equal(requests[0].signal.aborted, true);
  render("c");
  requests[1].resolve(response("b-private"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render("c").orders, null);
  requests[2].resolve(response("c-private"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render("c").orders.items[0].reference, "c-private");
  const current = render("c");
  current.setOffset(20);
  render("c");
  assert.match(requests.at(-1).url, /offset=20/);
  current.filter("fulfilled");
  const filtered = render("c");
  assert.equal(filtered.orders, null);
  assert.match(requests.at(-1).url, /offset=0.*status=fulfilled/);
  filtered.search("TST-123");
  render("c");
  assert.match(requests.at(-1).url, /q=TST-123&status=fulfilled/);
  cleanup();
});
