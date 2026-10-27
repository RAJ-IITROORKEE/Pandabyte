import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_MODULES,
  MAX_ADMIN_PAGE_SIZE,
  parseActionInput,
  parseAdminModule,
  parseCreateInput,
  parseDocument,
  parseInventoryAdjustment,
  parseListQuery,
  parseRecordId,
  parseUpdateInput,
  parseVariantPriceUpdate,
} from "../lib/admin/validation.ts";

const uuid = "d9428888-122b-11e1-b85c-61cd3cbb3210";
const common = { title: "A title", slug: "a-title", summary: "", blocks: [], seoTitle: "", seoDescription: "" };

test("page writes reject built-in routes without breaking historical reads or CMS-backed pages", () => {
  for (const slug of ["products", "shop", "blog", "solutions", "learn", "contact", "agent", "account", "admin", "staff", "sign-in", "sign-up", "api", "admin-preview", "cart", "checkout", "help-center", "admin-login"]) {
    const document = { ...common, slug };
    assert.equal(parseDocument("pages", document).ok, true);
    assert.equal(parseCreateInput("pages", { document }).ok, false, slug);
    assert.equal(parseUpdateInput("pages", { document, expectedVersion: 1 }).ok, false, slug);
  }
  for (const slug of ["home", "about", "help", "policies", "shipping-and-returns", "terms-and-conditions", "privacy-policy", "projects"]) {
    assert.equal(parseCreateInput("pages", { document: { ...common, slug } }).ok, true, slug);
  }
});

test("module routing is a closed registry with explicit CMS kinds", () => {
  assert.deepEqual(parseAdminModule("products"), "products");
  assert.deepEqual(parseAdminModule("videos"), "videos");
  assert.equal(parseAdminModule("users"), null);
  assert.equal(parseAdminModule("__proto__"), null);
  assert.equal(ADMIN_MODULES.products.kind, "product");
  assert.equal(ADMIN_MODULES.learn.kind, "resource");
});

test("product documents normalize known fields and reject price, stock, and executable HTML", () => {
  const valid = parseDocument("products", {
    ...common,
    categoryIds: [uuid],
    variants: [{ sku: "SKU-1", label: "Default" }],
    specifications: [{ name: "Voltage", value: "5 V" }],
    compatibility: ["Board A"],
    kitContents: [{ title: "Cable", quantity: 1 }],
    resources: [{ label: "Manual", url: "/manual.pdf" }],
    mediaIds: [uuid],
  });
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal("regularPaise" in valid.value, false);

  const priceField = parseDocument("products", { ...common, price: 500 });
  assert.equal(priceField.ok, false);
  if (!priceField.ok) assert.ok(priceField.fields.some((field) => field.code === "unknown_field"));

  const htmlBlock = parseDocument("pages", {
    ...common,
    blocks: [{ type: "html", html: "<script>alert(1)</script>" }],
  });
  assert.equal(htmlBlock.ok, false);
});

test("product 3D references are optional, closed, distinct and bounded", () => {
  const posterId = "bd4eeb12-1e5e-4f91-ae29-e70ee507b1ee";
  const legacy = parseDocument("products", { ...common, mediaIds: [uuid] });
  assert.equal(legacy.ok, true);
  if (legacy.ok) assert.equal("model3d" in legacy.value, false);

  const parsed = parseDocument("products", {
    ...common,
    model3d: { mediaId: uuid.toUpperCase(), posterId, alt: "  Board model  " },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value.model3d, { mediaId: uuid, posterId, alt: "Board model" });

  for (const model3d of [
    null,
    { mediaId: uuid, posterId: uuid, alt: "Same asset" },
    { mediaId: "invalid", posterId, alt: "Model" },
    { mediaId: uuid, posterId, alt: "" },
    { mediaId: uuid, posterId, alt: "x".repeat(301) },
    { mediaId: uuid, posterId, alt: "Model", published: true },
  ]) assert.equal(parseDocument("products", { ...common, model3d }).ok, false);
  assert.equal(parseDocument("pages", { ...common, model3d: { mediaId: uuid, posterId, alt: "Model" } }).ok, false);
});

test("typed documents validate nested links and deterministic singleton slugs", () => {
  assert.equal(parseDocument("contact", { ...common, slug: "company-contact" }).ok, false);
  assert.equal(parseDocument("navigation", { ...common, slug: "header" }).ok, false);

  const unsafeLink = parseDocument("team", {
    ...common,
    name: "Person",
    role: "Engineer",
    bio: "",
    mediaIds: [],
    links: [{ label: "bad", url: "javascript:alert(1)" }],
  });
  assert.equal(unsafeLink.ok, false);

  const goodNavigation = parseDocument("navigation", {
    ...common,
    slug: "primary",
    links: [{ label: "Catalog", href: "/products", group: "header", position: 0, visible: true }],
  });
  assert.equal(goodNavigation.ok, true);

  assert.equal(parseDocument("learn", { ...common, productIds: [], position: 0 }).ok, false);
  assert.equal(parseDocument("videos", { ...common, productIds: [], position: 0 }).ok, false);
  assert.equal(parseDocument("videos", { ...common, url: "https://youtu.be/AAAAAAAAAAA", productIds: [], position: 0 }).ok, true);
});

test("FAQ placements match the six unique SQL locations", () => {
  const locations = ["home", "about", "contact", "help", "product", "solutions"];
  const faq = (placements) => parseDocument("faqs", { ...common, answer: "Answer", topic: "Help", placements, position: 0 });

  assert.equal(faq([]).ok, true);
  assert.deepEqual(faq(locations).value?.placements, locations);
  for (const placement of locations) assert.equal(faq([placement]).ok, true, placement);
  for (const placements of [
    ["home", "home"],
    ["home", "unknown"],
    ["home", 1],
    [...locations, "home"],
  ]) {
    const result = faq(placements);
    assert.equal(result.ok, false, JSON.stringify(placements));
    if (!result.ok) assert.ok(result.fields.some((field) => field.field === "document.placements" || field.field.startsWith("document.placements.")));
  }
});

test("lists and record mutations reject unbounded or unknown input", () => {
  assert.equal(parseListQuery(new URLSearchParams(`limit=${MAX_ADMIN_PAGE_SIZE + 1}`)).ok, false);
  assert.equal(parseListQuery(new URLSearchParams("limit=10&extra=1")).ok, false);
  assert.equal(parseListQuery(new URLSearchParams("limit=10&limit=20")).ok, false);

  const create = parseCreateInput("pages", { document: common, role: "admin" });
  assert.equal(create.ok, false);
  const update = parseUpdateInput("pages", { expectedVersion: 1, document: common });
  assert.equal(update.ok, true);
  assert.equal(parseUpdateInput("pages", { expectedVersion: 0, document: common }).ok, false);
  assert.equal(parseRecordId("bad-id"), null);
  assert.equal(parseActionInput("restore", { expectedVersion: 2 }).ok, false);
  assert.equal(parseActionInput("publish", { expectedVersion: 2, revisionId: uuid }).ok, false);
  assert.equal(parseActionInput("publish", { expectedVersion: 0 }).ok, false);
});

test("contact copy is optional bounded text and navigation overrides have unique destinations", () => {
  const contact = { ...common, slug: "contact" };
  assert.equal(parseDocument("contact", contact).ok, true);
  const copy = { supportTitle: "Support", supportText: "  Reviewed support copy  ", footerTagline: "Built with care", copyrightName: "Company" };
  const parsed = parseDocument("contact", { ...contact, ...copy });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.supportText, "Reviewed support copy");
  for (const [key, max] of [["supportTitle",120],["supportText",1000],["footerTagline",160],["copyrightName",120]]) {
    for (const invalid of [null, {}, "x".repeat(max+1), "bad\u0001copy"]) assert.equal(parseDocument("contact", { ...contact, [key]: invalid }).ok, false);
    assert.equal(parseDocument("contact", { ...contact, [key]: "" }).ok, true);
  }
  assert.equal(parseDocument("pages", { ...common, supportTitle: "Not a site setting" }).ok, false);
  const link = { label: "Company", href: "/about", group: "header", position: 0, visible: true };
  for (const links of [null, {}, "invalid"]) assert.equal(parseDocument("navigation", { ...common, slug:"primary", links }).ok, false);
  assert.equal(parseDocument("navigation", { ...common, slug:"primary", links:[link,{...link,visible:false}] }).ok, false);
  assert.equal(parseDocument("navigation", { ...common, slug:"primary", links:[link,{...link,group:"footer"}] }).ok, true);
});

test("price updates enforce integer paise and coherent UTC sale windows", () => {
  const valid = parseVariantPriceUpdate({
    expectedVersion: 0,
    regularPaise: 50_000,
    salePaise: 45_000,
    saleFrom: "2026-10-24T00:00:00Z",
    saleUntil: "2026-10-25T00:00:00Z",
    reason: "Approved price change",
  });
  assert.equal(valid.ok, true);

  assert.equal(parseVariantPriceUpdate({
    expectedVersion: -1,
    regularPaise: 50_000,
    salePaise: null,
    saleFrom: null,
    saleUntil: null,
    reason: "Negative version",
  }).ok, false);
  assert.equal(parseVariantPriceUpdate({
    expectedVersion: 0,
    regularPaise: null,
    salePaise: null,
    saleFrom: null,
    saleUntil: null,
    reason: "Cannot clear price",
  }).ok, false);

  assert.equal(parseVariantPriceUpdate({
    expectedVersion: 2,
    regularPaise: 50_000,
    salePaise: 55_000,
    saleFrom: "2026-10-24T00:00:00Z",
    saleUntil: "2026-10-25T00:00:00Z",
    reason: "Invalid sale",
  }).ok, false);

  assert.equal(parseVariantPriceUpdate({
    expectedVersion: 2,
    regularPaise: 50_000,
    salePaise: null,
    saleFrom: "2026-10-24T00:00:00Z",
    saleUntil: null,
    reason: "Partial dates are invalid",
  }).ok, false);
});

test("inventory adjustments require a bounded nonzero delta and idempotency UUID", () => {
  assert.equal(parseInventoryAdjustment({
    expectedVersion: 0,
    delta: -3,
    reason: "Cycle count correction",
    requestId: uuid,
  }).ok, true);
  assert.equal(parseInventoryAdjustment({
    expectedVersion: -1,
    delta: 1,
    reason: "Negative version",
    requestId: uuid,
  }).ok, false);
  assert.equal(parseInventoryAdjustment({
    expectedVersion: 1,
    delta: 0,
    reason: "No change",
    requestId: uuid,
  }).ok, false);
  assert.equal(parseInventoryAdjustment({
    expectedVersion: 1,
    delta: 1_000_001,
    reason: "Too large",
    requestId: uuid,
  }).ok, false);
});
