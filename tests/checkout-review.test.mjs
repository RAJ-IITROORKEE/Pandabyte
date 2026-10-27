import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/cart/checkout-review.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function checkoutHarness() {
  let identity = { isLoaded: true, user: { id: "customer-a" } };
  let states = [];
  let stateIndex = 0;
  const effects = [];
  const signals = [];
  const exports = {};
  const dependencies = {
    "@clerk/nextjs": { useUser: () => identity },
    "next/image": { default: () => createElement("img") },
    "@/components/catalog/card-image-selection": { cardImageIds: () => [] },
    "./checkout-money": { includedDiscount: () => 0, formatPaise: value => value == null ? "Unavailable" : `₹${(value / 100).toFixed(2)}` },
    "./checkout-draft": { readDraft: () => null, saveDraft() {}, clearDraft() {} },
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "lucide-react": Object.fromEntries(["ArrowLeft", "ArrowRight", "CreditCard", "Package", "ShoppingBag", "Truck", "User"].map(name => [name, () => createElement("svg")])),
    react: {
      useState: initial => [stateIndex < states.length ? states[stateIndex++] : (stateIndex++, typeof initial === "function" ? initial() : initial), () => {}],
      useRef: initial => ({ current: initial }),
      useSyncExternalStore: () => null,
      useEffect: effect => effects.push(effect),
    },
    "./buy-now-store": { clearBuyNowSelection() {}, getBuyNowSelection() {}, getBuyNowServerSnapshot() {}, subscribeBuyNowSelection() {} },
    "./checkout-validation": { emptyAddress: () => ({}), validateStep: () => ({}) },
    "./cart-api": { loadCustomerCart: signal => { signals.push(signal); return Promise.resolve(null); }, cartErrorMessage: () => "Unable to load" },
    "./checkout-review.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), AbortController });
  return {
    effects,
    signals,
    identity: value => { identity = value; },
    wrapper: () => exports.CheckoutReview({}),
    renderSession: cart => {
      states = [cart?.quote ?? null, "", 0];
      stateIndex = 0;
      const session = exports.CheckoutReview({});
      return renderToStaticMarkup(createElement(session.type, session.props));
    },
  };
}

test("checkout hides private state while identity loads or signs out and remounts for a new account", () => {
  const review = checkoutHarness();
  assert.equal(review.wrapper().key, "customer-a:null");
  review.identity({ isLoaded: true, user: { id: "customer-b" } });
  assert.equal(review.wrapper().key, "customer-b:null");
  review.identity({ isLoaded: false, user: { id: "customer-a" } });
  assert.match(renderToStaticMarkup(review.wrapper()), /Loading your checkout review/);
  review.identity({ isLoaded: true, user: null });
  const signedOut = renderToStaticMarkup(review.wrapper());
  assert.match(signedOut, /Sign in to review your cart/);
  assert.doesNotMatch(signedOut, /Product subtotal|Payment coming soon/);
});

test("a populated quote displays server amounts and item issues while payment stays disabled", () => {
  const review = checkoutHarness();
  const html = review.renderSession({
    items: [{ variantId: "variant-a", quantity: 2 }],
    quote: {
      lines: [{ variantId: "variant-a", quantity: 2, slug: "test-board", title: "Test board", variant: { label: "Default" }, issue: "quantity_unavailable", lineTotalPaise: 24690 }],
      subtotalPaise: 24690,
      readyForCheckout: false,
    },
  });
  assert.match(html, /Test board/);
  assert.match(html, /Quantity 2/);
  assert.match(html, /₹246\.90/);
  assert.match(html, /Some items need attention/);
  assert.match(html, /Shipping<\/dt><dd>Not calculated/);
  assert.match(html, /GST<\/dt><dd>Not calculated/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Previous<\/button>/);
  assert.doesNotMatch(html, /Place order|Pay now/);

  const sourceHtml = review.renderSession({
    items: [{ variantId: "variant-a", quantity: 2 }],
    quote: { lines: [{ variantId: "variant-a", quantity: 2, slug: "test-board", title: "Test board",
      variant: { label: "Default", cartEligible: true }, issue: "quantity_unavailable", lineTotalPaise: 24690 }],
      subtotalPaise: 24690, readyForCheckout: false },
  });
  assert.match(sourceHtml, /Stock unverified/);
  assert.match(sourceHtml, /Stock is unverified for one or more items/);
  assert.match(sourceHtml, /Continue/);
  assert.doesNotMatch(sourceHtml, /Some items need attention/);
});

test("discarding a checkout session aborts its pending private cart read", async () => {
  const review = checkoutHarness();
  assert.match(review.renderSession(null), /Loading your checkout review/);
  const cleanup = review.effects.map(effect => effect()).find(value => typeof value === "function");
  assert.equal(review.signals.length, 1);
  assert.equal(review.signals[0].aborted, false);
  cleanup();
  assert.equal(review.signals[0].aborted, true);
  await Promise.resolve();
});

test("an empty checkout offers a return to shopping instead of a payment form", () => {
  const html = checkoutHarness().renderSession({ quote: { lines: [], subtotalPaise: 0, readyForCheckout: false } });
  assert.match(html, /Your selection is empty/);
  assert.match(html, /Open cart/);
  assert.doesNotMatch(html, /Continue to review|Payment unavailable/);
});
