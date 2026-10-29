import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { cardPricing } from "../catalog/card-pricing.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./favorites-list.tsx", import.meta.url), "utf8").replace("function FavoriteItem(", "export function FavoriteItem(");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const variant = { id: "v", sku: "A", label: "A", regularPricePaise: 10000, effectivePricePaise: 10000, isOnSale: false, saleEndsAt: null, availability: "available" };
function render(result) {
  const exports = {};
  const dependencies = {
    react: { useState: () => [result, () => {}], useEffect() {}, useRef: () => ({ current: null }) },
    "next/image": { default: () => null },
    "next/link": { default: ({ children, ...props }) => createElement("a", props, children) },
    "@/components/cart/add-to-cart-button": { AddToCartButton: () => createElement("button", null, "Add to cart") },
    "@/components/ui/button": { buttonClassName: () => "button" },
    "@/components/catalog/card-pricing": { cardPricing },
    "@/lib/editorial/public-record": {},
    "@/components/catalog/card-image-selection": {},
    "./favorites-button": { FavoritesButton: () => createElement("button", null, "Remove") },
    "./use-favorites": {},
    "./favorites.module.css": { default: {} },
  };
  runInNewContext(compiled, { exports, require: name => dependencies[name] ?? require(name) });
  return renderToStaticMarkup(createElement(exports.FavoriteItem, { item: { productId: "p", title: "Product", slug: "product" }, onRemoved() {} }));
}
const product = variants => ({ title: "Product", slug: "product", variants, sourceObservation: false });
test("favorite metadata uses current published prices and availability", () => {
  assert.match(render(product([variant])), /₹100\.00.*Available/);
  assert.match(render(product([{ ...variant, availability: "unavailable" }])), /₹100\.00.*Unavailable/);
  assert.match(render(product([variant, { ...variant, effectivePricePaise: 20000, regularPricePaise: 20000 }])), /From ₹100\.00.*Available/);
  assert.match(render(product([variant, { ...variant, effectivePricePaise: null, regularPricePaise: null }])), /Price unavailable.*Available/);
});
test("source stock remains unverified and unavailable records do not invent prices", () => {
  assert.match(render({ ...product([{ ...variant, availability: "unavailable", purchasable: false, cartEligible: true }]), sourceObservation: true }), /₹100\.00.*Availability unverified/);
  assert.match(render({ ...product([]), sourceObservation: true }), /Price unavailable.*Availability unverified/);
  assert.doesNotMatch(render("unavailable"), /₹|Add to cart/);
  assert.match(render("error"), /Current product details could not be loaded/);
});
