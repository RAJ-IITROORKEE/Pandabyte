import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(file) { return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const preferenceSource = compile("../components/theme-preference.tsx");
const toggleSource = compile("../components/theme-toggle.tsx");

function harness({ stored = null, dark = false, blocked = false } = {}) {
  const listeners = new Map();
  const mediaListeners = new Set();
  let current = stored;
  let frame;
  const root = { attrs: {}, style: {}, setAttribute(key, value) { this.attrs[key] = value; } };
  const media = { matches: dark, addEventListener(_, fn) { mediaListeners.add(fn); }, removeEventListener(_, fn) { mediaListeners.delete(fn); } };
  const window = {
    localStorage: { getItem() { if (blocked) throw Error(); return current; }, setItem(_, value) { if (blocked) throw Error(); current = value; }, removeItem() { if (blocked) throw Error(); current = null; } },
    matchMedia: () => media,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) ?? []) fn(event); },
    requestAnimationFrame(fn) { frame = fn; return 1; }, cancelAnimationFrame() { frame = null; },
  };
  const customEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  function mount(source, extra) {
    let index = 0;
    const values = [];
    const effects = [];
    const react = { useState(initial) { const at = index++; if (!(at in values)) values[at] = initial; return [values[at], value => { values[at] = value; }]; }, useRef(initial) { const at = index++; if (!(at in values)) values[at] = { current: initial }; return values[at]; }, useEffect(fn) { effects.push(fn); }, useLayoutEffect(fn) { effects.push(fn); } };
    const exports = {};
    const deps = { react, "@/lib/theme": { THEME_STORAGE_KEY: "pandabyte-theme" }, "@/components/account.module.css": { default: {} }, "lucide-react": { Sun: () => null, Moon: () => null }, ...extra };
    runInNewContext(source, { exports, window, document: { documentElement: root }, CustomEvent: customEvent, require: name => deps[name] ?? require(name) });
    const component = exports.ThemePreference ?? exports.ThemeToggle;
    function render() { index = 0; return component(); }
    render(); effects.splice(0).forEach(effect => effect());
    return { exports, render };
  }
  const toggle = mount(toggleSource, {});
  const prefs = mount(preferenceSource, { "@/components/theme-toggle": toggle.exports });
  if (frame) frame();
  function select() { return prefs.render().props.children[1].props.children[1]; }
  return { root, media, toggle, prefs, select, stored: () => current, dispatch: event => window.dispatchEvent(event), system(value) { media.matches = value; for (const fn of mediaListeners) fn(); } };
}

test("appearance choice synchronizes header, storage, and system changes", () => {
  const h = harness({ dark: true });
  assert.equal(h.select().props.value, "system");
  h.select().props.onChange({ target: { value: "light" } });
  assert.equal(h.stored(), "light");
  assert.equal(h.root.attrs["data-theme"], "light");
  assert.match(h.toggle.render().props["aria-label"], /dark/);
  h.toggle.render().props.onClick();
  assert.equal(h.select().props.value, "dark");
  h.select().props.onChange({ target: { value: "system" } });
  assert.equal(h.stored(), null);
  h.system(false);
  assert.equal(h.root.attrs["data-theme"], "light");
});

test("storage failure remains usable and other tabs synchronize", () => {
  const h = harness({ blocked: true });
  h.select().props.onChange({ target: { value: "dark" } });
  assert.equal(h.root.attrs["data-theme"], "dark");
  assert.equal(h.select().props.value, "dark");
  assert.equal(h.prefs.render().props.children[2].props.role, "status");
  h.dispatch({ type: "storage", key: "pandabyte-theme", newValue: "light" });
  assert.equal(h.select().props.value, "light");
  assert.equal(h.root.attrs["data-theme"], "light");
});
