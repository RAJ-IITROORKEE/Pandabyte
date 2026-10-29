import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
test("an open filter drawer returns focus to visible filters when desktop hides its opener", () => {
  const exports = {}, effects = [], refs = [];
  let resize, removed, focused = false, closed = 0;
  const desktop = {
    matches: false,
    addEventListener(event, listener) { assert.equal(event, "change"); resize = listener; },
    removeEventListener(event, listener) { removed = listener; },
  };
  const dependencies = {
    react: {
      useRef: () => { const ref = { current: null }; refs.push(ref); return ref; },
      useEffect: effect => effects.push(effect),
      useSyncExternalStore: () => true,
    },
    "lucide-react": { SlidersHorizontal: "icon", X: "icon" },
    "./catalog-filters.module.css": { default: {} },
  };
  const source = readFileSync(new URL("../components/catalog/catalog-filters.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), window: { matchMedia: () => desktop } });
  const tree = exports.CatalogFilters({ children: null });
  function find(node, predicate) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    return predicate(node) ? node : find(node.props?.children, predicate);
  }
  const dialog = find(tree, node => node.type === "dialog");
  const heading = find(tree, node => node.type === "h2");
  dialog.props.ref.current = { open: true, close() { this.open = false; closed++; } };
  if (heading.props.ref) heading.props.ref.current = { focus() { focused = true; } };
  const cleanups = effects.map(effect => effect());
  resize();
  assert.equal(closed, 0, "Mobile preference changes must leave the drawer open");
  desktop.matches = true;
  resize();
  assert.equal(closed, 1);
  assert.equal(focused, true, "Focus must not be lost to body or a hidden mobile opener");
  assert.equal(heading.props.tabIndex, -1);
  focused = false;
  resize();
  assert.equal(focused, false, "Resizing an already closed drawer must not steal focus");
  cleanups.forEach(cleanup => cleanup?.());
  assert.equal(removed, resize);
});
