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
function harness({ uploadFailures = 0 } = {}) {
  const uploads = [], created = [], revoked = [];
  let user = { id: "a", firstName: "Ada", lastName: "Lovelace", update: async values => ({ ...values }), setProfileImage: async ({ file }) => { uploads.push(file); if (uploadFailures-- > 0) throw new Error("Upload rejected"); return {}; } };
  let mounted, cursor, tree; const requests = [], exports = {}, billingExports = {};
  runInNewContext(compile("../lib/account/billing-profile.ts"), { exports: billingExports });
  const hooks = {
    useState(value) { const slot = mounted.slots[cursor++] ??= { value: typeof value === "function" ? value() : value }; return [slot.value, v => { slot.value = typeof v === "function" ? v(slot.value) : v; }]; },
    useRef(value) { return mounted.slots[cursor++] ??= { current: value }; },
    useEffect(effect, deps) { const slot = mounted.slots[cursor++] ??= {}; if (!slot.deps || deps.some((v, i) => v !== slot.deps[i])) { slot.deps = deps; mounted.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); }); } },
  };
  runInNewContext(compile("../components/account-profile-card.tsx"), { exports, AbortController, URL: { createObjectURL(file) { const url = `blob:photo-${created.length}`; created.push({ file, url }); return url; }, revokeObjectURL(url) { revoked.push(url); } }, fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })), require(name) {
    if (name === "react") return hooks;
    if (name === "@clerk/nextjs") return { useUser: () => ({ isLoaded: true, user }), useClerk: () => ({ user }), UserAvatar: () => null };
    if (name === "@/lib/account/billing-profile") return billingExports;
    if (name === "@/components/ui/button") return { buttonClassName: () => "button" };
    if (name === "next/image") return { default: "img" };
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
  return { requests, uploads, created, revoked, render, switchUser() { user = { ...user, id: "b" }; }, select(file) { const target = { files: file ? [file] : [], value: "chosen-file" }; find(n => n.type === "input" && n.props.type === "file").props.onChange({ target }); return target; }, cancelPhoto() { find(n => n.type === "button" && n.props.children === "Cancel photo change").props.onClick(); }, change(type, value) { find(n => n.type === "input" && n.props.type === type).props.onChange({ target: { value } }); }, submit() { return find(n => n.type === "form").props.onSubmit({ preventDefault() {} }); }, tree: () => tree };
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

test("photo selection previews locally, preserves selection on picker cancel and releases previews", async () => {
  const h = harness(); await loaded(h);
  const first = { name: "photo.png", type: "image/png", size: 100 };
  assert.equal(h.select(first).value, ""); h.render();
  assert.match(JSON.stringify(h.tree()), /Selected profile photo preview|preview only/);
  assert.equal(h.uploads.length, 0);
  h.select(null); h.render();
  assert.equal(h.created.length, 1);
  const second = { name: "replacement.webp", type: "image/webp", size: 100 };
  h.select(second); h.render();
  assert.deepEqual(h.revoked, ["blob:photo-0"]);
  h.cancelPhoto(); h.render();
  assert.deepEqual(h.revoked, ["blob:photo-0", "blob:photo-1"]);
  assert.doesNotMatch(JSON.stringify(h.tree()), /Selected profile photo preview|replacement.webp/);
  assert.equal(h.uploads.length, 0);
});

test("photo rejects unsupported, empty and oversized files but accepts the exact 5 MB boundary", async () => {
  const h = harness(); await loaded(h);
  for (const file of [{ name: "bad.svg", type: "image/svg+xml", size: 100 }, { name: "empty.jpg", type: "image/jpeg", size: 0 }, { name: "big.png", type: "image/png", size: 5 * 1024 * 1024 + 1 }]) {
    assert.equal(h.select(file).value, ""); h.render();
    assert.match(JSON.stringify(h.tree()), /Choose a non-empty JPEG, PNG or WebP/);
    const input = nodes(h.tree()).find(node => node.props?.id === "profile-photo");
    assert.equal(input.props["aria-invalid"], true);
    assert.match(input.props["aria-describedby"], /profile-photo-error/);
  }
  assert.equal(h.created.length, 0);
  h.select({ name: "boundary.jpg", type: "image/jpeg", size: 5 * 1024 * 1024 }); h.render();
  assert.equal(h.created.length, 1);
  assert.match(JSON.stringify(h.tree()), /boundary.jpg/);
});

test("photo uploads only on Save, retains failed selection for retry and clears a confirmed save", async () => {
  const h = harness({ uploadFailures: 1 }); await loaded(h);
  const file = { name: "photo.png", type: "image/png", size: 100 };
  h.select(file); h.render(); h.submit(); await flush(); h.render();
  assert.equal(h.uploads[0], file);
  assert.match(JSON.stringify(h.tree()), /Could not confirm: photo/);
  assert.match(JSON.stringify(h.tree()), /Selected profile photo preview/);
  h.submit(); await flush(); h.render();
  assert.equal(h.uploads.length, 2);
  assert.equal(h.requests.length, 2);
  assert.match(JSON.stringify(h.tree()), /Saved: photo/);
  assert.doesNotMatch(JSON.stringify(h.tree()), /Selected profile photo preview/);
  assert.deepEqual(h.revoked, ["blob:photo-0"]);
});

test("switching users releases an unsaved photo preview", async () => {
  const h = harness(); await loaded(h);
  h.select({ name: "photo.png", type: "image/png", size: 100 }); h.render();
  h.switchUser(); h.render();
  assert.deepEqual(h.revoked, ["blob:photo-0"]);
  assert.doesNotMatch(JSON.stringify(h.tree()), /photo.png|Selected profile photo preview/);
});
