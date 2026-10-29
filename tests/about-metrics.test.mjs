import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../components/storefront/about-metrics.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness({ reduced = false, observerAvailable = true } = {}) {
  let progress = 1, effect, intersect, change, cleanup, nextFrame = 0;
  const frames = new Map();
  const media = { matches: reduced, addEventListener: (_, fn) => { change = fn; }, removeEventListener: () => { change = undefined; } };
  let disconnected = false;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    IntersectionObserver: observerAvailable ? class {
      constructor(callback) { intersect = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    } : undefined,
    window: {
      matchMedia: () => media,
      requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
    },
    require(name) {
      if (name === "react") return { useRef: () => ({ current: {} }), useState: () => [progress, value => { progress = value; }], useEffect: fn => { effect = fn; } };
      if (name.endsWith(".module.css")) return { default: { metricValue: "visual-value", metricAccessible: "accessible-value" } };
      return require(name);
    },
  });
  const render = () => exports.AboutMetrics({ products: 42, categories: 5, people: 2 });
  render();
  return {
    html: () => renderToStaticMarkup(render()),
    mount: () => { cleanup = effect(); },
    enter: visible => intersect?.([{ isIntersecting: visible }]),
    tick(now) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); },
    reduce() { media.matches = true; change?.(); },
    unmount: () => cleanup?.(),
    pending: () => frames.size,
    progress: () => progress,
    disconnected: () => disconnected,
  };
}

test("server and initial client markup show final counts with a stable accessible alternative", () => {
  const h = harness();
  for (const value of [42, 5, 2]) assert.match(h.html(), new RegExp(`accessible-value">${value}\\+</span>`));
  assert.match(h.html(), /visual-value" aria-hidden="true">42\+/);
  assert.doesNotMatch(h.html(), /aria-live/);
});

test("counts animate only on entering view and finish at the actual totals", () => {
  const h = harness(); h.mount(); h.enter(false);
  assert.equal(h.pending(), 0);
  h.enter(true);
  assert.equal(h.progress(), 0);
  assert.equal(h.disconnected(), true);
  h.tick(0); h.tick(700);
  assert.ok(h.progress() > 0 && h.progress() < 1);
  assert.match(h.html(), /accessible-value">42\+/);
  h.tick(1400);
  assert.equal(h.progress(), 1);
  assert.equal(h.pending(), 0);
});

test("reduced motion and missing observers retain static counts; runtime reduction cancels animation", () => {
  for (const options of [{ reduced: true }, { observerAvailable: false }]) {
    const h = harness(options); h.mount(); h.enter(true);
    assert.equal(h.progress(), 1);
    assert.equal(h.pending(), 0);
  }
  const h = harness(); h.mount(); h.enter(true); h.tick(0); h.tick(300); h.reduce();
  assert.equal(h.progress(), 1);
  assert.equal(h.pending(), 0);
  h.unmount();
});

test("unmount disconnects the observer and cancels pending frames", () => {
  const h = harness(); h.mount(); h.enter(true); h.unmount();
  assert.equal(h.disconnected(), true);
  assert.equal(h.pending(), 0);
});
