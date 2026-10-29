import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const billing = { version: 2, businessName: "Business", contactEmail: "old@example.com", gstin: "" };
const response = body => ({ ok: true, json: async () => body });
function nodes(tree) { if (!tree || typeof tree !== "object") return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function harness() {
  let user = { id: "a", firstName: "Ada", lastName: "Lovelace", update: async values => ({ ...values }), setProfileImage: async () => ({}) };
  let mounted, cursor, tree; const requests = [], exports = {}, billingExports = {};
  runInNewContext(compile("../lib/account/billing-profile.ts"), { exports: billingExports });
  const hooks = {
    useState(value) { const slot = mounted.slots[cursor++] ??= { value: typeof value === "function" ? value() : value }; return [slot.value, v => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; },
    useRef(value) { return mounted.slots[cursor++] ??= { current: value }; },
    useEffect(effect, deps) { const slot = mounted.slots[cursor++] ??= {}; if (!slot.deps || deps.some((v, i) => v !== slot.deps[i])) { slot.deps = deps; mounted.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); }); } },
  };
  runInNewContext(compile("../components/account-profile-card.tsx"), { exports, AbortController, fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })), require(name) {
    if (name === "react") return hooks;
    if (name === "@clerk/nextjs") return { useUser: () => ({ isLoaded: true, user }), useClerk: () => ({ user }), UserAvatar: () => null };
    if (name === "@/lib/account/billing-profile") return billingExports;
    if (name === "@/components/ui/button") return { buttonClassName: () => "button" };
    if (name === "lucide-react") return { RefreshCw: () => null, Save: () => null };
    if (name.endsWith(".module.css")) return { default: {} };
    return require(name);
  } });
  function render() {
    const root = exports.AccountProfileCard();
    if (!mounted || mounted.key !== root.key) { mounted?.slots.forEach(slot => slot.cleanup?.()); mounted = { key: root.key, slots: [], effects: [] }; }
    cursor = 0; mounted.effects = []; tree = root.type(root.props); mounted.effects.forEach(effect => effect());
  }
  const find = fn => { const result = nodes(tree).find(fn); assert.ok(result); return result; };
  return { requests, render, switchUser() { user = { ...user, id: "b" }; }, change(type, value) { find(n => n.type === "input" && n.props.type === type).props.onChange({ target: { value } }); }, submit() { return find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); }, tree: () => tree };
}
async function loaded(h) { h.render(); h.requests[0].resolve(response({ profile: { phone: "111" } })); h.requests[1].resolve(response({ billingProfile: billing })); await flush(); h.render(); }

test("billing save retains other fields and version and reports partial failure", async () => {
  const h = harness(); await loaded(h); h.change("email", "new@example.com"); h.change("tel", "222"); h.render(); h.submit();
  assert.equal(h.requests[2].options.headers["x-account-owner"], "a");
  h.requests[2].resolve({ ok: false }); await flush();
  assert.deepEqual(JSON.parse(h.requests[3].options.body), { expectedVersion: 2, businessName: "Business", contactEmail: "new@example.com", gstin: "" });
  h.requests[3].resolve(response({ billingProfile: { ...billing, version: 3, contactEmail: "new@example.com" } })); await flush(); h.render();
  const text = JSON.stringify(h.tree()); assert.match(text, /Saved: billing email/); assert.match(text, /Could not confirm: contact phone/); assert.match(text, /222/);
  h.change("email", "edited@example.com"); h.render();
  assert.doesNotMatch(JSON.stringify(h.tree()), /Saved: billing email|Could not confirm: contact phone/);
});

test("switching accounts aborts private reads and ignores their responses", async () => {
  const h = harness(); h.render(); h.switchUser(); h.render();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.requests[0].resolve(response({ profile: { phone: "111" } })); h.requests[1].resolve(response({ billingProfile: billing })); await flush(); h.render();
  assert.doesNotMatch(JSON.stringify(h.tree()), /111|old@example.com/);
});
