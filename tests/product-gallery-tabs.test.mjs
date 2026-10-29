import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function harness(file, name) {
  const hooks = [];
  let cursor = 0;
  const exports = {};
  const dependencies = {
    react: {
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useId: () => "test-product-tabs",
    },
    "next/image": { default: "img" },
    "@radix-ui/react-dialog": Object.fromEntries(["Root", "Portal", "Overlay", "Content", "Title", "Description", "Close"].map(part => [part, `dialog-${part}`])),
    "lucide-react": { ChevronLeft: "chevron-left", ChevronRight: "chevron-right", X: "close-icon" },
    "./product-model-viewer": { ProductModelViewer: "model-viewer" },
    "./catalog.module.css": { default: {} },
    "./product-tabs.module.css": { default: {} },
  };
  const source = readFileSync(new URL(`../components/catalog/${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(compiled, { exports, require: dependency => dependencies[dependency] ?? require(dependency) });
  return props => { cursor = 0; return exports[name](props); };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const byRole = (tree, role) => nodes(tree, node => node.props?.role === role);
const byLabel = (tree, label) => nodes(tree, node => node.props?.["aria-label"] === label)[0];
const images = [{ id: "photo-a", alt: "Board front" }, { id: "photo-b", alt: "Board back" }];

test("product tabs keep selection, focus and panel relationships aligned for keyboard navigation", () => {
  const render = harness("product-tabs.tsx", "ProductTabs");
  const props = { tabs: ["Overview", "Specifications", "Gallery"].map(label => ({ label, content: label })) };
  let focused = -1;
  const draw = () => {
    const tree = render(props);
    byRole(tree, "tab").forEach((tab, index) => tab.props.ref({ focus: () => { focused = index; } }));
    return tree;
  };
  let tree = draw();
  for (const [key, expected] of [["ArrowLeft", 2], ["ArrowRight", 0], ["End", 2], ["Home", 0]]) {
    const active = byRole(tree, "tab").find(tab => tab.props["aria-selected"]);
    let prevented = false;
    active.props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
    tree = draw();
    assert.equal(prevented, true);
    assert.equal(focused, expected);
    const tabs = byRole(tree, "tab"), panels = byRole(tree, "tabpanel");
    assert.equal(tabs.filter(tab => tab.props.tabIndex === 0).length, 1);
    tabs.forEach((tab, index) => {
      assert.equal(tab.props["aria-selected"], index === expected);
      assert.equal(panels[index].props.hidden, index !== expected);
      assert.equal(tab.props["aria-controls"], panels[index].props.id);
      assert.equal(panels[index].props["aria-labelledby"], tab.props.id);
    });
  }
  byRole(tree, "tab")[1].props.onClick();
  assert.equal(byRole(draw(), "tab")[1].props["aria-selected"], true);
});

test("products with no detail tabs render no empty tab interface", () => {
  assert.equal(harness("product-tabs.tsx", "ProductTabs")({ tabs: [] }), null);
});

test("enlarged photo navigation wraps without entering the separate 3D slide and restores focus", () => {
  const render = harness("product-gallery.tsx", "ProductGallery");
  const props = { images, title: "Test board", model3d: { posterId: "poster", mediaId: "model" } };
  let tree = render(props), focused = false;
  byLabel(tree, "Enlarge image 1 of 2").props.onClick();
  tree = render(props);
  assert.equal(nodes(tree, node => node.type === "dialog-Root")[0].props.open, true);
  for (const [key, expected] of [["ArrowLeft", 2], ["ArrowRight", 1]]) {
    let prevented = false;
    nodes(tree, node => node.type === "dialog-Content")[0].props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
    tree = render(props);
    assert.equal(prevented, true);
    assert.ok(byLabel(tree, `Enlarge image ${expected} of 2`));
    assert.equal(nodes(tree, node => node.type === "model-viewer").length, 0);
  }
  byLabel(tree, "Next photo").props.onClick();
  tree = render(props);
  assert.ok(byLabel(tree, "Enlarge image 2 of 2"));
  const announcement = byRole(tree, "status")[0];
  assert.ok(announcement, "Enlarged photo changes need a live selection announcement");
  assert.equal(announcement.props["aria-atomic"], true);
  assert.match(announcement.props.children.join(""), /Photo 2 of 2/);
  byLabel(tree, "Previous photo").props.onClick();
  tree = render(props);
  byLabel(tree, "Enlarge image 1 of 2").props.ref.current = { focus: () => { focused = true; } };
  let prevented = false;
  nodes(tree, node => node.type === "dialog-Content")[0].props.onCloseAutoFocus({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(focused, true);
});

test("empty and model-only galleries expose no photo-enlargement controls", () => {
  for (const model3d of [undefined, { posterId: "poster", mediaId: "model" }]) {
    const tree = harness("product-gallery.tsx", "ProductGallery")({ images: [], title: "Test board", model3d });
    assert.equal(nodes(tree, node => node.type === "button" && node.props["aria-label"]?.startsWith("Enlarge image")).length, 0);
    assert.equal(byLabel(tree, "Next photo"), undefined);
    assert.equal(nodes(tree, node => node.type === "model-viewer").length, model3d ? 1 : 0);
    if (!model3d) assert.equal(nodes(tree, node => node.type === "p")[0].props.children, "No product images have been published.");
  }
});
