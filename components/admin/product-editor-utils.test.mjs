import assert from "node:assert/strict";
import test from "node:test";
import {
  dateTimeInputFromUtc,
  dateTimeInputToUtc,
  parsePriceToPaise,
  priceInputFromPaise,
  productSlugFromTitle,
} from "./product-editor-utils.ts";

test("product slugs are lowercase ASCII words bounded to the CMS length", () => {
  assert.equal(productSlugFromTitle("xC3M WS2812B RGB Ring"), "xc3m-ws2812b-rgb-ring");
  assert.equal(productSlugFromTitle("Pāndabyte / Board"), "pandabyte-board");
  assert.equal(productSlugFromTitle("你好"), "");
  assert.equal(productSlugFromTitle("A".repeat(170)), "a".repeat(160));
});

test("INR text converts to paise without rounding or unsafe values", () => {
  assert.equal(parsePriceToPaise("1,200.00"), null);
  assert.equal(parsePriceToPaise("1200.5"), 120_050);
  assert.equal(parsePriceToPaise("0"), 0);
  assert.equal(parsePriceToPaise("4.999"), null);
  assert.equal(parsePriceToPaise("-1"), null);
  assert.equal(parsePriceToPaise("100000000.01"), null);
  assert.equal(parsePriceToPaise("100000000"), 10_000_000_000);
  assert.equal(priceInputFromPaise(120_050), "1200.50");
  assert.equal(priceInputFromPaise(null), "");
});

test("local sale inputs round-trip through UTC without shifting wall-clock time", () => {
  const local = "2026-10-27T12:34";
  const utc = dateTimeInputToUtc(local);
  assert.ok(utc);
  assert.equal(dateTimeInputFromUtc(utc), local);
  assert.equal(dateTimeInputToUtc(""), null);
  assert.equal(dateTimeInputFromUtc("invalid"), "");
});
