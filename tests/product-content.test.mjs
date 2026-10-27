import assert from "node:assert/strict";
import test from "node:test";
import { parseProductRichContent, legacyBlocksToRichContent, productContentHref } from "../lib/admin/product-content.ts";
import { parseDocument } from "../lib/admin/validation.ts";

const id = "d9428888-122b-11e1-b85c-61cd3cbb3210";
const base = { title: "Sensor", slug: "sensor", summary: "", blocks: [], seoTitle: "", seoDescription: "", variants: [] };
const doc = content => ({ type: "doc", content });
const paragraph = text => ({ type: "paragraph", content: [{ type: "text", text }] });
test("rich content preserves legacy text, lists, links, code, tables and images", () => {
  const rich = legacyBlocksToRichContent([{ type: "paragraph", text: "Details" }, { type: "heading", level: 2, text: "Setup" }, { type: "code", language: "cpp", code: "setup();" }, { type: "bulletList", items: ["One"] }, { type: "link", url: "https://example.com/guide", label: "Guide" }, { type: "table", headers: ["Pin"], rows: [["A1"]] }, { type: "image", mediaId: id, alt: "Board" }]);
  assert.deepEqual(parseProductRichContent(rich), rich);
  assert.equal(parseDocument("products", { ...base, richContent: rich, documentMediaId: id, tags: ["ESP32"] }).ok, true);
});
test("rich content rejects executable attributes, invalid hierarchy and URLs", () => {
  assert.equal(parseProductRichContent({ type: "doc" }), null);
  assert.equal(productContentHref("https://example.com:99999"), false);
  assert.equal(productContentHref("https://example.com:65535/path?q=1"), true);
  assert.equal(productContentHref("https://name:secret@example.com/path"), false);
  assert.equal(productContentHref("https://example.com/guide%20one"), true);
  for (const content of [
    [{ type: "html", text: "<script>" }],
    [{ type: "image", attrs: { mediaId: id, alt: "Board", src: "https://evil.invalid/a" } }],
    [{ type: "text", text: "Unwrapped" }],
    [{ type: "paragraph", attrs: { style: "color:red" } }],
    [{ type: "paragraph", content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
    [{ type: "paragraph", content: [{ type: "text", text: "Color", marks: [{ type: "textStyle", attrs: { color: "url(https://evil.invalid)" } }] }] }],
  ]) assert.equal(parseProductRichContent(doc(content)), null);
  assert.equal(parseProductRichContent(doc(Array.from({ length: 201 }, () => paragraph("x")))), null);
  assert.equal(parseProductRichContent(doc([paragraph("x".repeat(100001))])), null);
});
test("product-only documents enforce five gallery images and distinct bounded tags", () => {
  const ids = Array.from({ length: 6 }, (_, i) => id.replace("d9428888", `d942888${i}`));
  assert.equal(parseDocument("products", { ...base, mediaIds: ids.slice(0, 5) }).ok, true);
  assert.equal(parseDocument("products", { ...base, mediaIds: ids }).ok, false);
  assert.equal(parseDocument("products", { ...base, tags: ["Board", "board"] }).ok, false);
  assert.equal(parseDocument("pages", { ...base, variants: undefined, richContent: doc([]) }).ok, false);
});

test("categories accept optional closed rich content and retain legacy blocks", () => {
  const blocks = [{ type: "paragraph", text: "Legacy category copy" }];
  const category = { title: base.title, slug: base.slug, summary: base.summary, blocks, seoTitle: base.seoTitle, seoDescription: base.seoDescription,
    parentId: null, position: 0, mediaIds: [id], richContent: doc([paragraph("Formatted category copy")]) };
  const parsed = parseDocument("categories", category);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.blocks, blocks);
  assert.deepEqual(parsed.value.richContent, category.richContent);
  assert.equal(parseDocument("categories", { ...category, richContent: doc([{
    type: "image", attrs: { mediaId: id, alt: "Category image", src: "https://example.com/image.webp" },
  }]) }).ok, false);
  assert.equal(parseDocument("categories", { ...category, documentMediaId: id }).ok, false);
});

test("blogs accept optional bounded rich content while retaining legacy blocks", () => {
  const blocks = [{ type: "paragraph", text: "Legacy blog copy" }];
  const blog = { title: base.title, slug: base.slug, summary: "", blocks, seoTitle: "", seoDescription: "",
    author: "", tags: [], mediaIds: [], richContent: doc([paragraph("Formatted blog copy")]) };
  const parsed = parseDocument("blog", blog);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.blocks, blocks);
  assert.deepEqual(parsed.value.richContent, blog.richContent);
  assert.equal(parseDocument("blog", { ...blog, richContent: doc([{ type: "image", attrs: { mediaId: id, alt: "Board", src: "https://example.com/image.webp" } }]) }).ok, false);
  assert.equal(parseDocument("blog", { ...blog, richContent: doc(Array.from({ length: 201 }, () => paragraph("x"))) }).ok, false);
  assert.equal(parseDocument("blog", { ...blog, richContent: undefined }).ok, true);
});
