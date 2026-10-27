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
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "lucide-react": Object.fromEntries(["CreditCard", "MapPin", "ShoppingBag"].map(name => [name, () => createElement("svg")])),
    react: {
      useState: initial => [stateIndex < states.length ? states[stateIndex++] : (stateIndex++, initial), () => {}],
      useEffect: effect => effects.push(effect),
    },
    "./cart-api": { loadCustomerCart: signal => { signals.push(signal); return Promise.resolve(null); }, cartErrorMessage: () => "Unable to load" },
    "./checkout-review.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name), AbortController });
  return {
    effects,
    signals,
    identity: value => { identity = value; },
    wrapper: () => exports.CheckoutReview(),
    renderSession: cart => {
      states = [cart, "", 0];
      stateIndex = 0;
      return renderToStaticMarkup(createElement(exports.CheckoutReview().type));
    },
  };
}

test("checkout hides private state while identity loads or signs out and remounts for a new account", () => {
  const review = checkoutHarness();
  assert.equal(review.wrapper().key, "customer-a");
  review.identity({ isLoaded: true, user: { id: "customer-b" } });
  assert.equal(review.wrapper().key, "customer-b");
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
  assert.match(html, /Shipping<\/dt><dd>Pending setup/);
  assert.match(html, /GST<\/dt><dd>Pending setup/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>.*Payment coming soon<\/button>/);
  assert.doesNotMatch(html, /<form|Place order|Pay now/);

  const sourceHtml = review.renderSession({
    items: [{ variantId: "variant-a", quantity: 2 }],
    quote: { lines: [{ variantId: "variant-a", quantity: 2, slug: "test-board", title: "Test board",
      variant: { label: "Default", cartEligible: true }, issue: "quantity_unavailable", lineTotalPaise: 24690 }],
      subtotalPaise: 24690, readyForCheckout: false },
  });
  assert.match(sourceHtml, /Stock is unverified for this item/);
  assert.match(sourceHtml, /Stock is unverified for one or more items/);
  assert.match(sourceHtml, /<button[^>]*disabled=""[^>]*>.*Payment coming soon<\/button>/);
  assert.doesNotMatch(sourceHtml, /Some items need attention/);
});

test("discarding a checkout session aborts its pending private cart read", async () => {
  const review = checkoutHarness();
  assert.match(review.renderSession(null), /Loading your checkout review/);
  const cleanup = review.effects[0]();
  assert.equal(review.signals.length, 1);
  assert.equal(review.signals[0].aborted, false);
  cleanup();
  assert.equal(review.signals[0].aborted, true);
  await Promise.resolve();
});
