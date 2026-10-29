import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const source = readFileSync(new URL("../components/cart/order-celebration.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
test("celebration is scoped to owner and order and consumed once", () => {
  const data = new Map(), exports = {};
  const sessionStorage = { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key), removeItem: key => data.delete(key) };
  runInNewContext(compiled, { exports, sessionStorage });
  exports.markCelebration("owner", "order-1");
  assert.equal(exports.consumeCelebration("other", "order-1"), false);
  assert.equal(exports.consumeCelebration("owner", "order-2"), false);
  assert.equal(exports.consumeCelebration("owner", "order-1"), true);
  assert.equal(exports.consumeCelebration("owner", "order-1"), false);
});
test("storage failure leaves a static fallback", () => {
  const exports = {}, sessionStorage = { setItem() { throw Error(); }, getItem() { throw Error(); } };
  runInNewContext(compiled, { exports, sessionStorage });
  assert.doesNotThrow(() => exports.markCelebration("owner", "order"));
  assert.equal(exports.consumeCelebration("owner", "order"), false);
});

test("player runs once, falls back on failure, and cleans up; reduced motion skips loading", async () => {
  const componentSource = readFileSync(new URL("../components/cart/order-success-animation.tsx", import.meta.url), "utf8");
  const component = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  async function exercise(reduced) {
    const exports = {}, refs = [], events = {}, motion = { matches: reduced, addEventListener(_event, fn) { this.listener = fn; }, removeEventListener() { this.removed = true; } };
    let effect, options, destroyed = 0;
    const player = { addEventListener: (name, fn) => { events[name] = fn; }, destroy: () => { destroyed++; } };
    const deps = { react: { useRef: initial => { const ref = { current: initial }; refs.push(ref); return ref; }, useEffect: fn => { effect = fn; } }, "lucide-react": { Check: () => null }, "./order-celebration": { consumeCelebration: () => true }, "./order-confirmation.module.css": { default: {} }, "lottie-web": { __esModule: true, default: { loadAnimation: value => { options = value; return player; } } } };
    runInNewContext(component, { exports, window: { matchMedia: () => motion }, require: name => deps[name] ?? require(name) });
    exports.OrderSuccessAnimation({ userId: "owner", reference: "order" });
    refs[0].current = { hidden: true }; refs[1].current = { hidden: false };
    const cleanup = effect();
    await new Promise(resolve => setImmediate(resolve));
    if (reduced) assert.equal(options, undefined);
    else {
      assert.equal(options.loop, false); assert.equal(options.path, "/animations/order-success.json");
      events.DOMLoaded(); assert.equal(refs[0].current.hidden, false); assert.equal(refs[1].current.hidden, true);
      events.data_failed(); assert.equal(refs[0].current.hidden, true); assert.equal(refs[1].current.hidden, false); assert.equal(destroyed, 1);
    }
    cleanup(); assert.equal(motion.removed, true);
  }
  await exercise(false); await exercise(true);
});

function lifecycle() {
  const componentSource = readFileSync(new URL("../components/cart/order-success-animation.tsx", import.meta.url), "utf8");
  const component = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}, refs = [], events = {}, motion = { matches: false, addEventListener(_event, fn) { this.listener = fn; }, removeEventListener(_event, fn) { assert.equal(this.listener, fn); this.listener = null; } };
  let effect, consumed = 0, loaded = 0, destroyed = 0;
  const player = { addEventListener: (name, fn) => { events[name] = fn; }, destroy: () => { destroyed++; } };
  const deps = { react: { useRef: initial => { const ref = { current: initial }; refs.push(ref); return ref; }, useEffect: fn => { effect = fn; } }, "lucide-react": { Check: () => null }, "./order-celebration": { consumeCelebration: () => { consumed++; return consumed === 1; } }, "./order-confirmation.module.css": { default: {} }, "lottie-web": { __esModule: true, default: { loadAnimation: () => { loaded++; return player; } } } };
  runInNewContext(component, { exports, window: { matchMedia: () => motion }, require: name => deps[name] ?? require(name) });
  exports.OrderSuccessAnimation({ userId: "owner", reference: "order" });
  refs[0].current = { hidden: true }; refs[1].current = { hidden: false };
  return { refs, events, motion, setup: () => effect(), get consumed() { return consumed; }, get loaded() { return loaded; }, get destroyed() { return destroyed; } };
}
const flushImport = () => new Promise(resolve => setImmediate(resolve));

test("Strict Mode setup and cleanup consume the marker once and start one player", async () => {
  const h = lifecycle();
  h.setup()();
  const cleanup = h.setup();
  await flushImport();
  assert.equal(h.consumed, 1); assert.equal(h.loaded, 1);
  h.events.DOMLoaded(); assert.equal(h.refs[0].current.hidden, false);
  cleanup();
  assert.equal(h.destroyed, 1); assert.equal(h.refs[1].current.hidden, false); assert.equal(h.motion.listener, null);
});

test("switching to reduced motion destroys a loaded player and restores the static icon", async () => {
  const h = lifecycle(), cleanup = h.setup();
  await flushImport();
  h.events.DOMLoaded();
  h.motion.matches = true; h.motion.listener();
  assert.equal(h.destroyed, 1); assert.equal(h.refs[0].current.hidden, true); assert.equal(h.refs[1].current.hidden, false);
  cleanup(); assert.equal(h.destroyed, 1); assert.equal(h.motion.listener, null);
});

test("motion change or unmount before the import resolves never starts a player", async () => {
  const motion = lifecycle(), cleanup = motion.setup();
  motion.motion.matches = true; motion.motion.listener();
  await flushImport();
  assert.equal(motion.loaded, 0); assert.equal(motion.refs[1].current.hidden, false);
  cleanup();
  const unmounted = lifecycle();
  unmounted.setup()();
  await flushImport();
  assert.equal(unmounted.loaded, 0); assert.equal(unmounted.refs[1].current.hidden, false); assert.equal(unmounted.motion.listener, null);
});
