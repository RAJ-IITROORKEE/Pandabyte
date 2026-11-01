import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../components/account-menu.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (status, capabilities = ["staff.manage"]) => ({ status, ok: status === 200, json: async () => ({ capabilities }) });

function harness({ header = false } = {}) {
  let identity = { isLoaded: true, isSignedIn: true, userId: "owner", sessionId: "session-a" };
  let pathname = "/", active, cursor, tree;
  const instances = new Map(), requests = [], events = new Map(), exports = {};
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const slot = active.slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slot.value, value => { slot.value = typeof value === "function" ? value(slot.value) : value; }];
    },
    useRef(initial) { return active.slots[cursor++] ??= { current: initial }; },
    useCallback(callback, deps) {
      const slot = active.slots[cursor++] ??= {};
      if (!same(slot.deps, deps)) { slot.deps = deps; slot.callback = callback; }
      return slot.callback;
    },
    useEffect(effect, deps) {
      const slot = active.slots[cursor++] ??= {};
      if (!same(slot.deps, deps)) { slot.deps = deps; active.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect(); }); }
    },
  };
  const window = { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); } };
  const dependencies = {
    react: { ...hooks, Fragment: "fragment" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@clerk/nextjs": {
      useAuth: () => identity,
      useUser: () => ({ isLoaded: identity.isLoaded, user: identity.userId ? { id: identity.userId, fullName: identity.userId } : null }),
      useClerk: () => ({ signOut() {} }), UserAvatar: "avatar",
    },
    "next/link": { default: "a" }, "next/navigation": { usePathname: () => pathname },
    "next/image": { default: "img" },
    "lucide-react": Object.fromEntries(["ChevronDown", "LayoutDashboard", "LogOut", "Settings", "ShieldCheck", "ShoppingBag"].map(name => [name, "svg"])),
    "@/components/account-menu.module.css": { default: {} },
    "@/components/site-header.css": {},
    "@/components/cart/cart-drawer": { CartDrawer: "cart-drawer" },
    "@/components/theme-toggle": { ThemeToggle: "theme-toggle" },
    "@/components/ui/navigation-menu": Object.fromEntries(["NavigationMenu", "NavigationMenuContent", "NavigationMenuItem", "NavigationMenuLink", "NavigationMenuList", "NavigationMenuTrigger"].map(name => [name, name])),
    "@/lib/site-navigation": { resolveSiteNavigation: () => ({ header: { primary: [], hardware: [], tools: [], upcoming: [], about: [], learn: [] } }) },
  };
  const globals = {
    exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    AbortController, AbortSignal, window,
    document: { addEventListener() {}, removeEventListener() {} },
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  };
  runInNewContext(compiled, globals);
  let root = exports.AccountMenu;
  if (header) {
    dependencies["@/components/auth-controls"] = { AuthControls: exports.AccountMenu };
    const headerExports = {};
    const headerSource = ts.transpileModule(readFileSync(new URL("../components/site-header.tsx", import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(headerSource, { ...globals, exports: headerExports });
    root = headerExports.SiteHeader;
  }
  const nodes = value => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
  function render() {
    const seen = new Set(), effects = [];
    function visit(value, trail) {
      if (!value || typeof value !== "object") return value;
      if (Array.isArray(value)) return value.map((item, i) => visit(item, trail + "/" + i));
      if (typeof value.type === "function") {
        const key = `${trail}/${value.type.name}:${value.key ?? ""}`;
        const instance = instances.get(key) ?? { slots: [], effects: [] };
        instances.set(key, instance); seen.add(key); active = instance; cursor = 0; instance.effects = [];
        const result = value.type(value.props); effects.push(...instance.effects);
        return visit(result, key);
      }
      return { ...value, props: { ...value.props, children: visit(value.props?.children, trail + "/children") } };
    }
    tree = visit(jsx(root, {}), "root");
    for (const [key, instance] of instances) if (!seen.has(key)) { instance.slots.forEach(slot => slot.cleanup?.()); instances.delete(key); }
    effects.forEach(effect => effect());
  }
  function click(label) {
    const button = nodes(tree).find(node => node.type === "button" && (node.props["aria-label"]?.startsWith(label) || node.props.children === label));
    assert.ok(button, "Missing button: " + label); button.props.onClick(); render();
  }
  return {
    render, click, requests, route: value => { pathname = value; render(); },
    identity: value => { identity = value; render(); }, focus: () => events.get("focus")?.(),
    admin: () => nodes(tree).some(node => node.type === "a" && node.props.href === "/admin"),
    checking: () => nodes(tree).some(node => node.props?.children === "Checking workspace access…"),
    error: () => nodes(tree).some(node => node.props?.children === "Workspace access could not be refreshed."),
    open: () => click("Account menu for"),
  };
}

test("access is prefetched and survives navigation, quick closing, and transient refresh failures", async () => {
  const h = harness(); h.render();
  assert.equal(h.requests.length, 1);
  h.open(); assert.equal(h.checking(), true); assert.equal(h.requests.length, 1);
  h.open(); // Closing the menu must not abort the session's access request.
  assert.equal(h.requests[0].options.signal.aborted, false);
  h.requests[0].resolve(response(200)); await flush(); h.render();
  h.route("/shop"); h.open(); assert.equal(h.admin(), true); assert.equal(h.requests.length, 2);
  h.requests[1].resolve(response(503)); await flush(); h.render();
  assert.equal(h.admin(), true); assert.equal(h.error(), true);
  h.click("Retry access check"); h.requests[2].resolve(response(403)); await flush(); h.render();
  assert.equal(h.admin(), false); assert.equal(h.error(), false);
});

test("the real navbar keeps the account session mounted while closing the panel on navigation", async () => {
  const h = harness({ header: true }); h.render(); h.open();
  h.requests[0].resolve(response(200)); await flush(); h.render(); assert.equal(h.admin(), true);
  h.route("/shop"); assert.equal(h.admin(), false); // The open panel closes, not the access session.
  h.open(); assert.equal(h.admin(), true); assert.equal(h.checking(), false);
  assert.equal(h.requests.length, 2); // One initial read and one menu-open refresh.
});

test("unknown or malformed responses never grant access and allow a retry", async () => {
  const h = harness(); h.render(); h.open();
  h.requests[0].resolve(response(200, [null])); await flush(); h.render();
  assert.equal(h.admin(), false); assert.equal(h.error(), true);
  h.click("Retry access check"); h.requests[1].resolve(response(200)); await flush(); h.render();
  assert.equal(h.admin(), true); assert.equal(h.error(), false);
});

test("focus observes new grants, and explicit denial removes an earlier link", async () => {
  const h = harness(); h.render(); h.open(); h.requests[0].resolve(response(403)); await flush(); h.render();
  assert.equal(h.admin(), false); assert.equal(h.error(), false);
  h.focus(); h.requests[1].resolve(response(200)); await flush(); h.render(); assert.equal(h.admin(), true);
  h.focus(); h.requests[2].resolve(response(401)); await flush(); h.render(); assert.equal(h.admin(), false);
});

test("user/session switches abort stale reads and never reuse another session's decision", async () => {
  const h = harness(); h.render(); h.open();
  h.identity({ isLoaded: true, isSignedIn: true, userId: "customer", sessionId: "session-b" });
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.open(); h.requests[0].resolve(response(200)); await flush(); h.render(); assert.equal(h.admin(), false);
  h.requests[1].resolve(response(200)); await flush(); h.render(); assert.equal(h.admin(), true);
  h.identity({ isLoaded: true, isSignedIn: true, userId: "customer", sessionId: "session-c" });
  h.open(); assert.equal(h.admin(), false); assert.equal(h.checking(), true);
  h.identity({ isLoaded: true, isSignedIn: false, userId: null, sessionId: null });
  assert.equal(h.requests[2].options.signal.aborted, true); assert.equal(h.admin(), false);
});
