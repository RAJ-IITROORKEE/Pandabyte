import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function footer() {
  const exports = {}, effects = [], listeners = new Map();
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(readFileSync(new URL("./sidebar-footer-actions.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, window: { innerWidth: 390, innerHeight: 844 }, document: {
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  }, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return { useId: () => "footer", useRef: () => ({ current: null }), useState: value => [value, () => {}], useEffect: fn => effects.push(fn) };
    if (name === "lucide-react") return { Ellipsis: "svg", ExternalLink: "svg" };
    if (name === "next/link") return { default: "a" };
    if (name.endsWith(".module.css")) return { default: {} };
    throw new Error(name);
  } });
  const tree = exports.SidebarFooterActions();
  const summary = tree.props.children[0];
  const link = tree.props.children[1].props.children;
  let focused = "";
  const details = { open: true, contains: node => node === "inside" };
  tree.props.ref.current = details;
  summary.props.ref.current = { focus: () => { focused = "trigger"; } };
  link.props.ref.current = { focus: () => { focused = "link"; } };
  const cleanups = effects.map(fn => fn());
  return { tree, summary, link, details, listeners, focused: () => focused, cleanup: () => cleanups.forEach(fn => fn?.()) };
}

test("Escape closes the footer and returns focus before the mobile drawer shortcut", () => {
  const h = footer(); let stopped = false, prevented = false, drawerClosed = false;
  const event = { key: "Escape", preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } };
  h.tree.props.onKeyDownCapture?.(event);
  if (!stopped) drawerClosed = true;
  h.tree.props.onKeyDown?.(event);
  assert.equal(drawerClosed, false); assert.equal(prevented, true);
  assert.equal(h.details.open, false); assert.equal(h.focused(), "trigger");
  assert.equal(h.summary.props.tabIndex, 0);
  h.cleanup();
});

test("outside pointer and blur dismiss the footer without stealing the next target's focus", () => {
  const h = footer();
  h.listeners.get("pointerdown")({ target: "inside" }); assert.equal(h.details.open, true);
  h.listeners.get("pointerdown")({ target: "outside" }); assert.equal(h.details.open, false);
  h.details.open = true; h.tree.props.onBlur({ currentTarget: h.details, relatedTarget: "outside" });
  assert.equal(h.details.open, false); assert.equal(h.focused(), "");
  assert.equal(h.link.props.href, "/");
  h.cleanup(); assert.equal(h.listeners.size, 0);
});
