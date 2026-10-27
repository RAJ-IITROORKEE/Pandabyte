import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "../components/cart/checkout-validation.ts";
import * as drafts from "../components/cart/checkout-draft.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/checkout-review.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(`${source}\nexport { CheckoutSession };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function harness() {
  const hooks = [{ lines: [{ variantId: "test-variant", quantity: 2, title: "Test board", lineTotalPaise: 20000, issue: null }], subtotalPaise: 20000, readyForCheckout: true }];
  let cursor = 0, effects = [], focused = "", focusEffectIndex;
  const exports = {};
  const dependencies = {
    "./razorpay-test-payment": { RazorpayTest: () => null, markerKey: user => `pending:${user}` },
    react: {
      useState: initial => { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], value => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }]; },
      useRef: initial => { const index = cursor++; return hooks[index] ??= { current: initial }; },
      useEffect: (effect, deps) => { const index = cursor++, previous = hooks[index]; if (deps.length === 1 && typeof deps[0] === "number") focusEffectIndex ??= index; hooks[index] = deps; if (!previous || deps.some((value, position) => !Object.is(value, previous[position]))) effects.push({ index, effect }); },
    },
    "@clerk/nextjs": {}, "next/link": { default: "a" }, "next/image": { default: "img" },
    "lucide-react": Object.fromEntries(["ArrowLeft", "ArrowRight", "CreditCard", "Package", "ShoppingBag", "Truck", "User"].map(name => [name, "svg"])),
    "./checkout-validation": validation, "./checkout-draft": drafts,
    "./checkout-money": { includedDiscount: () => 0, formatPaise: value => `₹${value / 100}` },
    "@/lib/checkout/validation": {}, "./simulation-pending": {}, "./cart-utils": { sameCartItems: () => true },
    "./cart-api": {}, "./buy-now-store": {}, "./customer-cart-store": {},
    "@/components/catalog/card-image-selection": {}, "./checkout-review.module.css": { default: {} },
  };
  runInNewContext(compiled, {
    exports, require: name => dependencies[name] ?? require(name),
    requestAnimationFrame: callback => callback(),
    document: { getElementById: id => ({ focus: () => { focused = id; } }) },
  });
  let tree;
  function render() {
    cursor = 0; effects = [];
    tree = exports.CheckoutSession({ draftKey: "test-user:null", selection: null, email: "ada@example.test", name: "Ada Lovelace" });
    const heading = find(tree, node => node.type === "h2" && node.props.ref);
    heading.props.ref.current = { focus: () => { focused = "step-heading"; } };
    effects.find(item => item.index === focusEffectIndex)?.effect();
    return tree;
  }
  return {
    render,
    change(id, value) { find(tree, node => node.props?.id === `checkout-${id}`).props.onChange({ target: { value } }); return render(); },
    submit() { find(tree, node => node.type === "form").props.onSubmit({ preventDefault() {} }); return render(); },
    focused: () => focused,
    current: () => find(find(tree, node => node.props?.["aria-current"] === "step"), node => node.type === "button").props["aria-label"].replace(/^Go to /, ""),
    stepButton: label => find(find(tree, node => node.props?.["aria-label"] === "Checkout progress"), node => node.type === "button" && node.props["aria-label"]?.startsWith(`Go to ${label}`)),
  };
}

test("checkout validates each step, preserves edits, focuses errors and keeps final payment disabled", () => {
  drafts.clearDraft();
  const checkout = harness();
  checkout.render();
  assert.equal(checkout.stepButton("Information").props.disabled, false);
  for (const step of ["Shipping", "Payment", "Review"]) assert.equal(checkout.stepButton(step).props.disabled, true);
  checkout.submit();
  assert.equal(checkout.current(), "Information");
  assert.equal(checkout.focused(), "checkout-phone");
  checkout.change("phone", "+91 98765 43210");
  checkout.submit();
  assert.equal(checkout.current(), "Shipping");
  assert.equal(checkout.focused(), "step-heading");
  const completed = checkout.stepButton("Information");
  assert.equal(completed.props.disabled, false);
  assert.match(completed.props["aria-label"], /completed/);
  completed.props.onClick();
  const revisited = checkout.render();
  assert.equal(checkout.current(), "Information");
  assert.equal(find(revisited, node => node.props?.id === "checkout-phone").props.value, "+91 98765 43210");
  assert.equal(checkout.stepButton("Payment").props.disabled, true);
  checkout.submit();
  assert.equal(checkout.current(), "Shipping");
  checkout.submit();
  assert.equal(checkout.current(), "Shipping");
  assert.equal(checkout.focused(), "checkout-shipping.recipientName");
  for (const [field, value] of Object.entries({ recipientName: "Ada", phone: "+91 98765 43210", line1: "1 Main Street", city: "Pune", state: "Maharashtra", postalCode: "411001" })) checkout.change(`shipping.${field}`, value);
  checkout.submit();
  assert.equal(checkout.current(), "Payment");
  const review = checkout.submit();
  assert.equal(checkout.current(), "Review");
  assert.equal(find(review, node => node.type === "button" && node.props.children === "Payment unavailable").props.disabled, true);
  find(review, node => node.type === "button" && node.props.children === "Edit").props.onClick();
  checkout.render();
  assert.equal(checkout.current(), "Information");
  checkout.change("email", "invalid");
  checkout.submit();
  assert.equal(checkout.current(), "Information");
  assert.equal(checkout.focused(), "checkout-email");
  const returned = harness();
  const returnedTree = returned.render();
  assert.equal(find(returnedTree, node => node.props?.id === "checkout-email").props.value, "invalid");
  assert.equal(drafts.readDraft("test-user:null").shipping.city, "Pune");
  assert.equal(drafts.readDraft("another-user:null"), null);
  drafts.clearDraft();
});
