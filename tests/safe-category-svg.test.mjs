import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MAX_CATEGORY_SVG_BYTES, prepareSafeCategorySvg } from "../lib/editorial/safe-category-svg.ts";

const NS = "http://www.w3.org/2000/svg";

function svg(body, attrs = 'width="64" height="64" viewBox="0 0 64 64"') {
  return Buffer.from(`<svg xmlns="${NS}" ${attrs}>${body}</svg>`);
}

test("validates a bounded static SVG then returns alpha-preserving WebP bytes", async () => {
  const source = svg('<defs><linearGradient id="paint" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f00"/><stop offset="100%" stop-color="#00f"/></linearGradient><clipPath id="crop"><circle cx="32" cy="32" r="29"/></clipPath></defs><g clip-path="URL(#crop)" fill="url(#paint)"><path d="M8 8 L56 8 L56 56 L8 56 Z"/></g>');
  const prepared = await prepareSafeCategorySvg(source);
  assert.ok(prepared);
  assert.equal(prepared.mimeType, "image/webp");
  assert.equal(prepared.extension, "webp");
  const metadata = await sharp(prepared.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 64);
  assert.equal(metadata.hasAlpha, true);
});

test("uses a bounded viewBox as the raster size when width and height are omitted", async () => {
  const prepared = await prepareSafeCategorySvg(svg('<g id="mark"><path id="silhouette" d="M0 0 L48 0 L48 32 L0 32 Z"/></g>', 'viewBox="0 0 48 32"'));
  assert.ok(prepared);
  const metadata = await sharp(prepared.bytes).metadata();
  assert.equal(metadata.width, 48);
  assert.equal(metadata.height, 32);
  assert.equal(metadata.format, "webp");
});

test("rejects raw entities, resource references, CSS, event handlers, and namespace tricks", async () => {
  const bad = [
    `<!DOCTYPE svg [<!ENTITY file SYSTEM "file:///etc/passwd">]>${svg("<path d='M0 0L1 1'/>").toString()}`,
    svg('<image href="https://example.invalid/pixel.png" width="1" height="1"/>'),
    svg('<path d="M0 0L1 1" fill="url(https://example.invalid/a.svg#paint)"/>'),
    svg('<path d="M0 0L1 1" fill="url(data:image/svg+xml;base64,PHN2Zz4=)"/>'),
    svg('<path d="M0 0L1 1" fill="&#x75;rl(https://example.invalid/a.svg#paint)"/>'),
    svg('<style>@import url(https://example.invalid/a.css)</style>'),
    svg('<path onload="alert(1)" d="M0 0L1 1"/>'),
    Buffer.from(`<svg xmlns="http://example.invalid/svg" width="64" height="64"><path d="M0 0L1 1"/></svg>`),
    Buffer.from(`<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64"><path d="M0 0L1 1" xlink:href="#x"/></svg>`),
  ];
  for (const bytes of bad) assert.equal(await prepareSafeCategorySvg(bytes), null);
});

test("rejects XML declarations, dimensions, nesting, node, and payload limits outside the safe envelope", async () => {
  assert.equal(await prepareSafeCategorySvg(Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>${svg("").toString()}`)), null);
  assert.equal(await prepareSafeCategorySvg(svg("", 'width="9000" height="64"')), null);
  assert.equal(await prepareSafeCategorySvg(svg("", 'width="5000" height="5000"')), null);
  assert.equal(await prepareSafeCategorySvg(svg(`<g>${"<g>".repeat(33)}<path d="M0 0L1 1"/>${"</g>".repeat(33)}</g>`)), null);
  assert.equal(await prepareSafeCategorySvg(svg(`<defs>${Array.from({ length: 2048 }, (_, index) => `<clipPath id="c${index}"/>`).join("")}</defs>`)), null);
  assert.equal(await prepareSafeCategorySvg(svg(`<path d="M0 0 ${"L1 1 ".repeat(4000)}"/>`)), null);
  const tooManyAttributes = Array.from({ length: 40 }, (_, index) => `x${index}="x"`).join(" ");
  assert.equal(await prepareSafeCategorySvg(svg(`<path ${tooManyAttributes} d="M0 0L1 1"/>`)), null);
  assert.equal(await prepareSafeCategorySvg(Buffer.alloc(MAX_CATEGORY_SVG_BYTES + 1)), null);
});

test("rejects unknown, duplicate, wrong-kind, and unresolved local references", async () => {
  assert.equal(await prepareSafeCategorySvg(svg('<path d="M0 0L1 1" style="fill:red"/>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<defs><linearGradient id="same"/><clipPath id="same"/></defs>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<defs><clipPath id="crop"/></defs><path d="M0 0L1 1" fill="url(#crop)"/>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<path d="M0 0L1 1" clip-path="url(#missing)"/>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<defs><clipPath id="crop"><path d="M0 0L1 1" clip-path="url(#crop)"/></clipPath></defs>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<g id="shape"><path d="M0 0L1 1" fill="url(#shape)"/></g>')), null);
  assert.equal(await prepareSafeCategorySvg(svg('<g id="same"><path id="same" d="M0 0L1 1"/></g>')), null);
});
