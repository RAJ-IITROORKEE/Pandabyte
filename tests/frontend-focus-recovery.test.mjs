import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadComponent(path, dependencies, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../components/${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), ...globals });
  return exports;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return;
  if (Array.isArray(tree)) return tree.map(node => find(node, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

function dialogHarness() {
  let context;
  const hooks = [];
  let cursor = 0;
  const components = loadComponent("core/morphing-dialog.tsx", {
    react: {
      createContext: () => ({ Provider: "provider" }), useContext: () => context,
      useId: () => "test-dialog",
      useRef: initial => hooks[cursor++] ??= { current: initial },
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
    },
    "@radix-ui/react-dialog": Object.fromEntries(["Root", "Trigger", "Content", "Portal", "Overlay", "Title", "Description", "Close"].map(name => [name, `dialog-${name}`])),
    "motion/react": { motion: { button: "motion-button", div: "motion-div" }, MotionConfig: "motion-config", useReducedMotion: () => false },
    "lucide-react": { X: "close-icon" }, "./morphing-dialog.module.css": { default: {} },
  });
  function render() {
    cursor = 0;
    context = components.MorphingDialog({ children: null }).props.value;
  }
  render();
  return {
    trigger(props = {}) { return find(components.MorphingDialogTrigger(props), node => node.type === "motion-button"); },
    close() {
      const content = components.MorphingDialogContent({ children: null });
      let prevented = false;
      content.props.onCloseAutoFocus({ preventDefault: () => { prevented = true; } });
      return prevented;
    },
    render,
  };
}

test("quick view returns focus to whichever trigger opened it", () => {
  const dialog = dialogHarness();
  let focused = "", clicks = 0;
  const targets = ["Choose options", "Quick view"].map(name => ({ isConnected: true, focus() { focused = name; } }));
  const triggers = targets.map(() => dialog.trigger({ onClick: () => { clicks++; } }));
  for (const index of [0, 1, 0]) {
    triggers[index].props.onClick({ currentTarget: targets[index], defaultPrevented: false });
    dialog.render();
    assert.equal(dialog.close(), true);
    assert.equal(focused, index === 0 ? "Choose options" : "Quick view");
  }
  assert.equal(clicks, 3);
});

test("quick view leaves Radix focus fallback available if its opener disappeared", () => {
  const dialog = dialogHarness();
  let focused = false;
  const target = { isConnected: false, focus() { focused = true; } };
  dialog.trigger().props.onClick({ currentTarget: target, defaultPrevented: false });
  assert.equal(dialog.close(), false);
  assert.equal(focused, false);
});

const favorites = ["a", "b", "c"].map((name, index) => ({ productId: `00000000-0000-0000-0000-00000000000${index}`, title: `Board ${name}`, slug: `board-${name}` }));

function favoritesHarness(initial = favorites) {
  let raw = JSON.stringify(initial), persist = true, active, focused = "", controls = new Map();
  const body = {}, document = { body, activeElement: body };
  const section = { focus() { focused = "section"; document.activeElement = this; }, querySelectorAll: () => [...controls.values()].map(control => control.target) };
  const store = loadComponent("favorites/favorites-store.ts", {}, {
    localStorage: { getItem: () => raw, setItem(_key, value) { if (!persist) throw new Error("Storage unavailable"); raw = value; } },
    window: { dispatchEvent() {} }, Event,
  });
  const frames = [];
  const useFavorites = () => ({ items: store.parseFavorites(raw), account: false, loading: false, error: null, toggle: async item => store.toggleFavorite(item) });
  const instances = new Map();
  const react = {
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useRef: initial => active.hooks[active.cursor++] ??= { current: initial },
    useState: initial => {
      const owner = active, index = owner.cursor++;
      if (!(index in owner.hooks)) owner.hooks[index] = initial;
      return [owner.hooks[index], value => { owner.hooks[index] = value; }];
    },
    useEffect: (callback, deps) => {
      const index = active.cursor++, previous = active.hooks[index];
      if (!previous || deps.some((value, position) => !Object.is(value, previous[position]))) active.effects.push(callback);
      active.hooks[index] = deps;
    },
  };
  const { FavoritesButton } = loadComponent("favorites/favorites-button.tsx", {
    react, "./use-favorites": { useFavorites }, "lucide-react": { Heart: "heart-icon" }, "./favorites.module.css": { default: {} },
  }, { document });
  const { FavoritesList } = loadComponent("favorites/favorites-list.tsx", {
    react, "./use-favorites": { useFavorites }, "./favorites-button": { FavoritesButton },
    "next/image": { default: "img" }, "next/link": { default: "a" },
    "@/components/cart/add-to-cart-button": {}, "@/lib/editorial/public-record": {},
    "@/components/catalog/card-image-selection": {}, "@/components/catalog/card-pricing": { cardPricing: () => ({ price: "Price unavailable", availability: "Availability unavailable" }) }, "./favorites.module.css": { default: {} },
  }, { document, requestAnimationFrame: callback => frames.push(callback) });
  function run(key, component, props) {
    const instance = instances.get(key) ?? { hooks: [] };
    instances.set(key, instance);
    active = instance; active.cursor = 0; active.effects = [];
    return component(props);
  }
  function render() {
    const tree = run("list", FavoritesList, {});
    const effects = [...instances.get("list").effects];
    tree.props.ref.current = section;
    const next = new Map();
    for (const item of JSON.parse(raw)) {
      const rowElement = find(tree, node => typeof node.type === "function" && node.props.item?.productId === item.productId);
      const row = run(`row-${item.productId}`, rowElement.type, rowElement.props);
      const buttonElement = find(row, node => node.type === FavoritesButton);
      const button = find(run(`button-${item.productId}`, FavoritesButton, buttonElement.props), node => node.type === "button");
      const target = controls.get(item.productId)?.target ?? { focus() { focused = item.slug; document.activeElement = this; } };
      next.set(item.productId, { target, button });
    }
    if ([...controls.values()].some(control => control.target === document.activeElement && ![...next.values()].some(value => value.target === control.target))) document.activeElement = body;
    controls = next;
    effects.forEach(effect => effect());
    frames.splice(0).forEach(frame => frame());
    return tree;
  }
  render();
  return {
    render, focused: () => focused,
    remove(index, { focus = true } = {}) {
      const control = [...controls.values()][index];
      if (focus) document.activeElement = control.target;
      return control.button.props.onClick({ currentTarget: control.target });
    },
    failStorage() { persist = false; },
    replace(items) { raw = JSON.stringify(items); },
    moveFocusElsewhere() { document.activeElement = {}; },
    items: () => JSON.parse(raw),
  };
}

for (const [index, expected] of [[0, "board-b"], [1, "board-c"], [2, "board-b"]]) test(`removing favorite ${index + 1} focuses its successor or final neighbor`, async () => {
  const list = favoritesHarness();
  await list.remove(index);
  list.render();
  assert.equal(list.focused(), expected);
  assert.equal(list.items().length, 2);
});

test("removing the only favorite focuses the remaining empty region", async () => {
  const list = favoritesHarness([favorites[0]]);
  await list.remove(0);
  const tree = list.render();
  assert.equal(list.focused(), "section");
  assert.equal(tree.props.tabIndex, -1);
  assert.equal(tree.props["aria-label"], "Saved favorites");
  assert.equal(list.items().length, 0);
});

test("failed favorite persistence leaves focus and stored entries alone", async () => {
  const list = favoritesHarness();
  list.failStorage();
  await list.remove(0);
  list.render();
  assert.equal(list.focused(), "");
  assert.equal(list.items().length, 3);
  list.replace(favorites.slice(1));
  list.render();
  assert.equal(list.focused(), "", "failed removal must not leave pending focus for a later storage update");
});

test("unrelated favorites updates and unfocused removals do not take focus", async () => {
  const list = favoritesHarness();
  list.replace(favorites.slice(1));
  list.render();
  assert.equal(list.focused(), "");
  await list.remove(0, { focus: false });
  list.render();
  assert.equal(list.focused(), "");
});

test("favorite removal respects focus moved elsewhere before the update commits", async () => {
  const list = favoritesHarness();
  await list.remove(0);
  list.moveFocusElsewhere();
  list.render();
  assert.equal(list.focused(), "");
});
