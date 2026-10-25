import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@insforge/sdk";
import sharp from "sharp";

import {
  appRequest,
  cleanFixtures,
  createFixtures,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "phase3-test-fixtures.json");
const adminCapabilities = ["content.edit", "catalog.edit", "content.publish", "orders.manage", "media.manage", "inquiries.manage"];
const fixtureCapabilities = [...adminCapabilities, "staff.manage"];
const singletonModules = new Set(["contact", "navigation"]);
const modules = ["products", "categories", "blog", "pages", "faqs", "team", "navigation", "contact", "solutions", "learn", "videos"];
const mediaBucketName = "editorial-media";
const privateBucketName = "private-account-files";

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function ensure(condition, label) {
  if (!condition) throw new HarnessFailure(label);
}

function safeUnknownErrorSummary(error) {
  const rawName = typeof error?.name === "string" ? error.name : "Error";
  const name = rawName.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || "Error";
  const stack = typeof error?.stack === "string" ? error.stack : "";
  const localLocation = stack.match(/phase3-publishing\.mjs:(\d+):(\d+)/);
  return localLocation ? `${name} at phase3-publishing.mjs:${localLocation[1]}:${localLocation[2]}` : name;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleFor(runId, suffix) {
  return `Phase3 ${runId} ${suffix}`;
}

function slugFor(runId, suffix) {
  return `p3-${runId.slice(0, 8)}-${suffix}`;
}

function parseArguments() {
  const args = new Set(process.argv.slice(2));
  ensure([...args].every((arg) => arg === "--keep-fixtures" || arg === "--cleanup"), "invalid_command_line");
  ensure(!(args.has("--keep-fixtures") && args.has("--cleanup")), "invalid_command_line");
  return { keepFixtures: args.has("--keep-fixtures"), cleanupOnly: args.has("--cleanup") };
}

function table(client, name) {
  return client.database.schema("public").from(name);
}

async function rpc(client, name, args) {
  try {
    return await client.database.schema("public").rpc(name, args);
  } catch {
    return { data: null, error: true };
  }
}

async function grantCapability(context, userId, capability, enabled, runId) {
  const { error } = await rpc(context.admin, "set_staff_capability", {
    target_user_id: userId,
    capability_name: capability,
    enabled,
    reason: `phase3 disposable fixture ${runId}`,
  });
  ensure(!error, `capability_${enabled ? "grant" : "revoke"}_failed`);
}

async function request(context, route, token, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
    return appRequest(context.appOrigin, route, token, { ...options, body: JSON.stringify(options.json), headers });
  }
  return appRequest(context.appOrigin, route, token, { ...options, headers });
}

async function responseJson(response, label) {
  return safeJson(response, label);
}

function checkStatus(response, status, label) {
  ensure(response.status === status, label);
}

async function checkJsonResponse(response, status, label) {
  checkStatus(response, status, label);
  return responseJson(response, label);
}

function commonDocument(runId, suffix) {
  return {
    title: titleFor(runId, suffix),
    slug: slugFor(runId, suffix),
    summary: `Disposable Phase 3 fixture ${runId}.`,
    blocks: [{ type: "paragraph", text: `Fixture content ${runId} ${suffix}.` }],
    seoTitle: titleFor(runId, suffix),
    seoDescription: `Test-only content for ${runId}.`,
  };
}

function documentFor(adminModule, runId, suffix, overrides = {}) {
  const common = commonDocument(runId, suffix);
  let extra = {};
  if (adminModule === "products") extra = {
    categoryIds: [], variants: [{ sku: `P3-${runId.slice(0, 8)}-${suffix}`.toUpperCase(), label: "Fixture variant" }],
    specifications: [], compatibility: [], kitContents: [], resources: [], mediaIds: [],
  };
  if (adminModule === "categories") extra = { parentId: null, position: 0, mediaIds: [] };
  if (adminModule === "blog") extra = { author: "Phase 3 test fixture", tags: [], mediaIds: [] };
  if (adminModule === "faqs") extra = { answer: `Test answer ${runId}.`, topic: "testing", placements: ["home"], position: 0 };
  if (adminModule === "team") extra = { name: "Phase 3 fixture", role: "Test role", bio: "Disposable test profile.", mediaIds: [], links: [], position: 0 };
  if (adminModule === "navigation") extra = { links: [] };
  if (adminModule === "contact") extra = {
    email: "phase3@example.invalid", phone: "", address: "Test fixture address", hours: "", timezone: "Asia/Kolkata", socialLinks: [],
  };
  if (adminModule === "learn") extra = { url: "https://example.com/phase3-resource", productIds: [], position: 0 };
  if (adminModule === "videos") extra = { url: "https://youtu.be/AAAAAAAAAAA", productIds: [], position: 0 };
  if (adminModule === "navigation") common.slug = "primary";
  if (adminModule === "contact") common.slug = "contact";
  return { ...common, ...extra, ...overrides };
}

async function checkpoint(state) {
  const safe = {
    runId: state.runId,
    users: state.users.map(({ userId, email, sessionId, role, runId }) => ({ userId, email, sessionId, role, runId })),
    staffUserId: state.staffUserId,
    records: state.records,
    variants: state.variants,
    media: state.media,
    storageKeys: state.storageKeys,
    inquiries: state.inquiries,
  };
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

async function createRecord(context, state, auth, adminModule, document, status = 201) {
  const response = await request(context, `/api/admin/${adminModule}`, auth.staff.appToken, { method: "POST", json: { document } });
  const body = await checkJsonResponse(response, status, `create_${adminModule}_failed`);
  if (status !== 201) return body;
  ensure(body.record?.id && body.record.kind, `create_${adminModule}_response_invalid`);
  state.records.push({ id: body.record.id, module: adminModule, kind: body.record.kind, slug: body.record.slug });
  if (adminModule === "products") {
    for (const variant of body.record.document?.variants ?? []) {
      ensure(variant.id, "created_product_variant_id_missing");
      state.variants.push({ id: variant.id, productId: body.record.id, sku: variant.sku });
    }
  }
  await checkpoint(state);
  return body.record;
}

async function updateRecord(context, state, auth, adminModule, record, document, expectedVersion = record.version) {
  const response = await request(context, `/api/admin/${adminModule}/${record.id}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion, document },
  });
  const body = await checkJsonResponse(response, 200, `update_${adminModule}_failed`);
  record = body.record;
  const stored = state.records.find((item) => item.id === record.id);
  if (stored) stored.slug = record.slug;
  await checkpoint(state);
  return record;
}

export async function transition(context, auth, adminModule, record, action, extras = {}) {
  const response = await request(context, `/api/admin/${adminModule}/${record.id}/${action}`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: record.version, ...extras },
  });
  return checkJsonResponse(response, 200, `${action}_${adminModule}_failed`);
}

export async function getAdminRecord(context, auth, adminModule, id, label = "admin_record_read_failed") {
  const response = await request(context, `/api/admin/${adminModule}/${id}`, auth.staff.appToken);
  return (await checkJsonResponse(response, 200, label)).record;
}

async function verifyInitialCapabilities(context, state, auth) {
  for (const capability of fixtureCapabilities) {
    for (const role of ["customer", "staff"]) {
      const result = await rpc(auth[role].database, "has_capability", { capability_name: capability });
      ensure(!result.error && result.data === false, `fixture_pregranted_${capability}`);
    }
  }
  for (const capability of adminCapabilities) await grantCapability(context, state.staffUserId, capability, true, state.runId);
  for (const capability of adminCapabilities) {
    const result = await rpc(auth.staff.database, "has_capability", { capability_name: capability });
    ensure(!result.error && result.data === true, `fixture_capability_missing_${capability}`);
  }
}

async function verifyLegacyAnonymousBoundaries(context, state, auth) {
  const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
  ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
  const anon = createClient({ baseUrl: context.baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
  const publicProbe = await rpc(anon, "published_list_records", { p_kind: "page", p_query: "", p_limit: 1, p_offset: 0 });
  ensure(!publicProbe.error && Array.isArray(publicProbe.data?.items), "valid_anon_key_public_probe_failed");

  const customer = state.users.find((fixture) => fixture.role === "customer");
  const privateClient = auth.customer.database;
  const fileId = randomUUID();
  const key = `${customer.userId}/${fileId}.txt`;
  const content = `Phase 3 private regression fixture ${state.runId}.`;
  const upload = await privateClient.storage.from(privateBucketName).upload(key, new Blob([content], { type: "text/plain" }));
  ensure(!upload.error && upload.data?.key === key && typeof upload.data?.url === "string", "private_fixture_upload_failed");
  const metadata = await table(privateClient, "account_files").insert([{
    id: fileId,
    user_id: customer.userId,
    object_key: key,
    storage_url: upload.data.url,
    filename: "phase3-private-test.txt",
    byte_size: Buffer.byteLength(content),
  }]).select("id").single();
  ensure(!metadata.error && metadata.data?.id === fileId, "private_fixture_metadata_failed");

  for (const [name, columns] of [["customer_profiles", "user_id"], ["account_files", "user_id,object_key"]]) {
    const result = await anon.database.schema("public").from(name).select(columns).limit(5);
    if (!result.error) ensure(asArray(result.data).length === 0, `anonymous_${name}_exposed`);
  }
  const anonymousFile = await anon.storage.from(privateBucketName).download(key);
  ensure(Boolean(anonymousFile.error) || !anonymousFile.data, "anonymous_private_file_download_allowed");
  checkStatus(await request(context, `/api/media/${fileId}`, null), 404, "private_customer_file_exposed_as_media");
}

async function verifyClosedModuleValidators(context, state, auth) {
  for (const adminModule of modules) {
    const bad = documentFor(adminModule, state.runId, `invalid-${adminModule}`);
    bad.rawHtml = "<script>fixture</script>";
    const response = await request(context, `/api/admin/${adminModule}`, auth.staff.appToken, { method: "POST", json: { document: bad } });
    const body = await checkJsonResponse(response, 400, `unknown_field_accepted_${adminModule}`);
    ensure(Array.isArray(body.error?.fields) && body.error.fields.some((field) => field.code === "unknown_field"), `unknown_field_error_missing_${adminModule}`);
  }
  const noOrigin = await request(context, "/api/admin/pages", auth.staff.appToken, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: commonDocument(state.runId, "origin-check") }),
  });
  checkStatus(noOrigin, 403, "same_origin_write_allowed");
  const wrongType = await request(context, "/api/admin/pages", auth.staff.appToken, {
    method: "POST", headers: { origin: context.appOrigin, "content-type": "text/plain" }, body: "{}",
  });
  checkStatus(wrongType, 415, "non_json_write_allowed");
  const tooLarge = await request(context, "/api/admin/pages", auth.staff.appToken, {
    method: "POST", headers: { origin: context.appOrigin, "content-type": "application/json" }, body: JSON.stringify({ document: { ...commonDocument(state.runId, "large"), summary: "x".repeat(270_000) } }),
  });
  checkStatus(tooLarge, 413, "oversized_admin_body_accepted");
}

async function verifyAccessBoundaries(context, state, auth) {
  const anonymous = await request(context, "/api/admin/pages", null);
  checkStatus(anonymous, 401, "anonymous_admin_list_allowed");
  const customer = await request(context, "/api/admin/pages", auth.customer.appToken);
  checkStatus(customer, 403, "customer_admin_list_allowed");

  const directList = await rpc(auth.customer.database, "admin_list_records", {
    p_kind: "page", p_query: "", p_limit: 1, p_offset: 0,
  });
  ensure(directList.error?.code === "P0001" && directList.error.details === "forbidden", "customer_direct_admin_list_not_forbidden");
  const directSave = await rpc(auth.customer.database, "admin_save_record", {
    p_id: randomUUID(),
    p_kind: "page",
    p_expected_version: 1,
    p_document: commonDocument(state.runId, "direct-rpc-unauthorized-save"),
  });
  ensure(directSave.error?.code === "P0001" && directSave.error.details === "forbidden", "customer_direct_admin_save_not_forbidden");
  const historyRead = await table(auth.customer.database, "cms_revisions").select("id").limit(1);
  ensure(historyRead.error?.code === "42501", "customer_direct_history_read_allowed");
  const historyUpdate = await table(auth.customer.database, "cms_revisions")
    .update({ title: "Must not be written" }).eq("record_id", randomUUID()).select("id");
  ensure(historyUpdate.error?.code === "42501", "customer_direct_history_update_allowed");

  const staffAccess = await request(context, "/api/admin/pages", auth.staff.appToken);
  checkStatus(staffAccess, 200, "granted_staff_admin_list_denied");
  ensure(staffAccess.headers.get("cache-control")?.includes("no-store"), "admin_response_cacheable");

  await grantCapability(context, state.staffUserId, "content.publish", false, state.runId);
  const revoked = await request(context, "/api/admin/pages", auth.staff.appToken);
  checkStatus(revoked, 200, "content_edit_depended_on_publish_capability");
  const publishDenied = await request(context, "/api/admin/pages/00000000-0000-4000-8000-000000000000/publish", auth.staff.appToken, {
    method: "POST", json: { expectedVersion: 1 },
  });
  checkStatus(publishDenied, 403, "revoked_publish_capability_allowed_action");
  await grantCapability(context, state.staffUserId, "content.publish", true, state.runId);
}

async function verifyModuleRecords(context, state, auth) {
  const created = new Map();
  for (const adminModule of modules) {
    if (singletonModules.has(adminModule)) {
      const existing = await request(context, `/api/admin/${adminModule}?limit=1`, auth.staff.appToken);
      const existingBody = await checkJsonResponse(existing, 200, `singleton_check_${adminModule}_failed`);
      if (existingBody.total > 0) continue;
    }
    const record = await createRecord(context, state, auth, adminModule, documentFor(adminModule, state.runId, `module-${adminModule}`));
    created.set(adminModule, record);
  }
  for (const adminModule of modules) {
    const query = encodeURIComponent(`Phase3 ${state.runId}`);
    const list = await request(context, `/api/admin/${adminModule}?q=${query}&limit=100`, auth.staff.appToken);
    const body = await checkJsonResponse(list, 200, `list_${adminModule}_failed`);
    ensure(Array.isArray(body.items) && Number.isSafeInteger(body.total), `list_${adminModule}_shape_invalid`);
  }
  const resource = created.get("learn");
  const video = created.get("videos");
  ensure(!resource || resource.kind === "resource", "learn_alias_kind_wrong");
  ensure(!video || video.kind === "video", "video_alias_kind_wrong");
  return created;
}

async function verifyCategoryGraphAndSku(context, state, auth, created) {
  const categoryA = created.get("categories");
  ensure(categoryA, "category_fixture_missing");
  const categoryB = await createRecord(context, state, auth, "categories", documentFor("categories", state.runId, "category-b"));
  const productDocument = documentFor("products", state.runId, "category-product", { categoryIds: [categoryA.id] });
  const product = await createRecord(context, state, auth, "products", productDocument);
  const duplicateSku = documentFor("products", state.runId, "duplicate-sku", {
    variants: [{ sku: product.document.variants[0].sku, label: "Duplicate fixture" }],
  });
  const duplicate = await request(context, "/api/admin/products", auth.staff.appToken, { method: "POST", json: { document: duplicateSku } });
  checkStatus(duplicate, 409, "duplicate_sku_accepted");

  const linkedCategory = await updateRecord(context, state, auth, "categories", categoryA,
    documentFor("categories", state.runId, "category-a", { parentId: categoryB.id }));
  const cyclic = await request(context, `/api/admin/categories/${categoryB.id}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: categoryB.version, document: documentFor("categories", state.runId, "category-b", { parentId: categoryA.id }) },
  });
  ensure([400, 409].includes(cyclic.status), "category_cycle_accepted");
  const publishedParent = await transition(context, auth, "categories", categoryB, "publish");
  const publishedCategory = await transition(context, auth, "categories", linkedCategory, "publish");
  const publishWithoutPrice = await request(context, `/api/admin/products/${product.id}/publish`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: product.version },
  });
  checkStatus(publishWithoutPrice, 409, "unpriced_product_published");
  return { categoryA: publishedCategory.record, categoryB: publishedParent.record, product };
}

export async function verifyPublishingAndRestore(context, state, auth) {
  let page = await createRecord(context, state, auth, "pages", documentFor("pages", state.runId, "history-a"));
  const draftRead = await request(context, `/api/published/pages/${page.slug}`, null);
  checkStatus(draftRead, 404, "draft_visible_publicly");
  const publicDraftList = await request(context, `/api/published/pages?q=${encodeURIComponent(state.runId)}&limit=100`, null);
  const publicDraftBody = await checkJsonResponse(publicDraftList, 200, "public_draft_list_failed");
  ensure(!publicDraftBody.items.some((item) => item.slug === page.slug), "draft_in_public_list");
  const privateHeaders = await request(context, `/api/admin/pages/${page.id}`, auth.staff.appToken);
  await checkJsonResponse(privateHeaders, 200, "draft_read_failed");
  ensure(privateHeaders.headers.get("cache-control")?.includes("no-store"), "draft_response_cacheable");
  const revisionA = await transition(context, auth, "pages", page, "publish");
  page = revisionA.record;
  const firstDetail = await getAdminRecord(context, auth, "pages", page.id);
  ensure(Array.isArray(firstDetail.revisions) && firstDetail.revisions.length === 1, "first_revision_missing");
  const sourceRevision = firstDetail.revisions[0].id;

  const nextDoc = documentFor("pages", state.runId, "history-b", { blocks: [{ type: "heading", level: 2, text: `Live B ${state.runId}` }] });
  page = await updateRecord(context, state, auth, "pages", page, nextDoc);
  const stillOld = await request(context, `/api/published/pages/${slugFor(state.runId, "history-a")}`, null);
  const oldBody = await checkJsonResponse(stillOld, 200, "draft_update_changed_live_content");
  ensure(oldBody.record.title === titleFor(state.runId, "history-a"), "draft_update_leaked_publicly");
  const staleUpdate = await request(context, `/api/admin/pages/${page.id}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 1, document: nextDoc },
  });
  checkStatus(staleUpdate, 409, "stale_cms_update_accepted");
  page = (await transition(context, auth, "pages", page, "publish")).record;
  const liveB = await request(context, `/api/published/pages/${page.slug}`, null);
  const liveBody = await checkJsonResponse(liveB, 200, "published_page_missing");
  ensure(liveBody.record.title === nextDoc.title && liveBody.record.document.blocks[0].text === `Live B ${state.runId}`, "new_revision_not_public");
  const publicLiveList = await request(context, `/api/published/pages?q=${encodeURIComponent(state.runId)}&limit=100`, null);
  const publicLiveBody = await checkJsonResponse(publicLiveList, 200, "published_page_list_failed");
  const listItem = publicLiveBody.items.find((item) => item.slug === page.slug);
  ensure(listItem && !("document" in listItem) && !("blocks" in listItem), "public_list_includes_large_document");
  const redirect = await request(context, `/api/published/pages/${slugFor(state.runId, "history-a")}`, null, { redirect: "manual" });
  checkStatus(redirect, 307, "old_slug_did_not_redirect");
  ensure(redirect.headers.get("location")?.endsWith(`/api/published/pages/${page.slug}`), "redirect_target_mismatch");

  const detail = await getAdminRecord(context, auth, "pages", page.id);
  const restored = await transition(context, auth, "pages", page, "restore", { revisionId: sourceRevision });
  page = restored.record;
  ensure(page.document.title === titleFor(state.runId, "history-a"), "revision_restore_not_copied_to_draft");
  ensure(page.publishedRevisionId === detail.publishedRevisionId, "revision_restore_published_silently");
  const publicAfterRestore = await request(context, `/api/published/pages/${slugFor(state.runId, "history-b")}`, null);
  const publicAfterRestoreBody = await checkJsonResponse(publicAfterRestore, 200, "restore_removed_current_public_revision");
  ensure(publicAfterRestoreBody.record.title === nextDoc.title, "restored_draft_replaced_live_content");
  const unpublish = await transition(context, auth, "pages", page, "unpublish");
  page = unpublish.record;
  checkStatus(await request(context, `/api/published/pages/${slugFor(state.runId, "history-b")}`, null), 404, "unpublished_page_still_public");
  const archive = await transition(context, auth, "pages", page, "archive");
  ensure(archive.record.archived, "archive_action_did_not_archive");
  checkStatus(await request(context, `/api/published/pages/${slugFor(state.runId, "history-b")}`, null), 404, "archived_page_still_public");
}

async function verifyProductPricesAndInventory(context, state, auth, product, categoryA) {
  const variantId = product.document.variants[0]?.id;
  ensure(variantId, "product_variant_id_missing");
  const priceList = await request(context, `/api/admin/pricing?q=${encodeURIComponent(product.document.variants[0].sku)}&limit=10`, auth.staff.appToken);
  const priceListBody = await checkJsonResponse(priceList, 200, "pricing_list_failed");
  let variant = priceListBody.items.find((item) => item.id === variantId);
  ensure(variant && variant.priceVersion === 0 && variant.regularPaise === null, "initial_price_version_or_value_wrong");

  const invalidBound = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 0, regularPaise: 10_000_000_001, salePaise: null, saleFrom: null, saleUntil: null, reason: "Out of bounds" },
  });
  checkStatus(invalidBound, 400, "out_of_range_price_accepted");
  const invalidSale = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 0, regularPaise: 10_000, salePaise: 10_001, saleFrom: "2026-10-26T00:00:00Z", saleUntil: "2026-10-27T00:00:00Z", reason: "Invalid sale" },
  });
  checkStatus(invalidSale, 400, "sale_above_regular_accepted");

  const start = new Date(Date.now() + 60 * 60_000).toISOString();
  const end = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const setPrice = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 0, regularPaise: 100_000, salePaise: 90_000, saleFrom: start, saleUntil: end, reason: `Fixture price ${state.runId}` },
  });
  const setPriceBody = await checkJsonResponse(setPrice, 200, "valid_price_update_failed");
  variant = setPriceBody.variant;
  ensure(variant.priceVersion === 1 && variant.regularPaise === 100_000, "price_version_not_incremented");
  const stalePrice = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 0, regularPaise: 101_000, salePaise: null, saleFrom: null, saleUntil: null, reason: "Stale price" },
  });
  checkStatus(stalePrice, 409, "stale_price_update_accepted");

  await grantCapability(context, state.staffUserId, "orders.manage", false, state.runId);
  checkStatus(await request(context, "/api/admin/inventory?limit=1", auth.staff.appToken), 403, "inventory_allowed_without_orders_capability");
  checkStatus(await request(context, "/api/admin/pricing?limit=1", auth.staff.appToken), 200, "pricing_denied_without_orders_capability");
  const catalogOnly = await rpc(auth.staff.database, "admin_list_variants", {
    p_query: product.document.variants[0].sku, p_limit: 10, p_offset: 0,
  });
  ensure(!catalogOnly.error && Array.isArray(catalogOnly.data?.items), "catalog_only_variant_list_rpc_failed");
  const catalogOnlyVariant = catalogOnly.data.items.find((item) => item.id === variantId);
  ensure(catalogOnlyVariant && catalogOnlyVariant.regularPaise === 100_000 && catalogOnlyVariant.priceVersion === 1,
    "catalog_only_price_fields_masked_or_missing");
  ensure(catalogOnlyVariant.stock === null && catalogOnlyVariant.stockVersion === null,
    "catalog_only_stock_fields_exposed");
  await grantCapability(context, state.staffUserId, "orders.manage", true, state.runId);
  await grantCapability(context, state.staffUserId, "catalog.edit", false, state.runId);
  checkStatus(await request(context, "/api/admin/pricing?limit=1", auth.staff.appToken), 403, "pricing_allowed_without_catalog_capability");
  checkStatus(await request(context, "/api/admin/inventory?limit=1", auth.staff.appToken), 200, "inventory_denied_without_catalog_capability");
  const ordersOnly = await rpc(auth.staff.database, "admin_list_variants", {
    p_query: product.document.variants[0].sku, p_limit: 10, p_offset: 0,
  });
  ensure(!ordersOnly.error && Array.isArray(ordersOnly.data?.items), "orders_only_variant_list_rpc_failed");
  const ordersOnlyVariant = ordersOnly.data.items.find((item) => item.id === variantId);
  ensure(ordersOnlyVariant && ordersOnlyVariant.regularPaise === null && ordersOnlyVariant.salePaise === null &&
    ordersOnlyVariant.saleFrom === null && ordersOnlyVariant.saleUntil === null && ordersOnlyVariant.priceVersion === 0,
  "orders_only_price_fields_exposed");
  ensure(ordersOnlyVariant.stock === 0 && ordersOnlyVariant.stockVersion === 0,
    "orders_only_stock_fields_masked_or_missing");
  await grantCapability(context, state.staffUserId, "catalog.edit", true, state.runId);

  const inventoryList = await request(context, `/api/admin/inventory?q=${encodeURIComponent(product.document.variants[0].sku)}&limit=10`, auth.staff.appToken);
  const inventoryBody = await checkJsonResponse(inventoryList, 200, "inventory_list_failed");
  variant = inventoryBody.items.find((item) => item.id === variantId);
  ensure(variant && variant.stock === 0 && variant.stockVersion === 0, "initial_stock_version_or_value_wrong");
  const negative = await request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 0, delta: -1, reason: "Below zero", requestId: randomUUID() },
  });
  checkStatus(negative, 409, "negative_stock_accepted");
  const requestId = randomUUID();
  const initialAdjustment = { expectedVersion: 0, delta: 10, reason: `Fixture count ${state.runId}`, requestId };
  const added = await request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, { method: "PATCH", json: initialAdjustment });
  const addedBody = await checkJsonResponse(added, 200, "initial_stock_adjustment_failed");
  ensure(addedBody.variant.stock === 10 && addedBody.variant.stockVersion === 1, "stock_adjustment_wrong");
  const replay = await request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, { method: "PATCH", json: initialAdjustment });
  const replayBody = await checkJsonResponse(replay, 200, "same_stock_request_not_idempotent");
  ensure(replayBody.variant.stock === 10 && replayBody.variant.stockVersion === 1, "idempotent_stock_replay_changed_balance");
  const collision = await request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { ...initialAdjustment, delta: 11 },
  });
  checkStatus(collision, 409, "stock_request_id_payload_reuse_allowed");

  const concurrent = await Promise.all([1, 2].map((delta) => request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 1, delta, reason: `Concurrent fixture ${state.runId}`, requestId: randomUUID() },
  })));
  const statuses = concurrent.map((response) => response.status).sort();
  ensure(statuses[0] === 200 && statuses[1] === 409, "concurrent_stock_version_not_serialized");
  const currentList = await request(context, `/api/admin/inventory?q=${encodeURIComponent(product.document.variants[0].sku)}&limit=10`, auth.staff.appToken);
  const currentBody = await checkJsonResponse(currentList, 200, "inventory_after_concurrency_failed");
  variant = currentBody.items.find((item) => item.id === variantId);
  ensure(variant && variant.stockVersion === 2 && [11, 12].includes(variant.stock), "concurrent_stock_result_wrong");
  const tooMuch = await request(context, `/api/admin/inventory/${variantId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: variant.stockVersion, delta: -(variant.stock + 1), reason: "Prevent negative fixture balance", requestId: randomUUID() },
  });
  checkStatus(tooMuch, 409, "stock_became_negative");

  const publishProduct = await request(context, `/api/admin/products/${product.id}/publish`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: product.version },
  });
  const publishedBody = await checkJsonResponse(publishProduct, 200, "priced_product_publish_failed");
  const published = await request(context, `/api/published/products/${product.slug}`, null);
  const publicProduct = await checkJsonResponse(published, 200, "published_product_unavailable");
  ensure(publicProduct.record.variants?.[0]?.sku === product.document.variants[0].sku, "published_variant_missing");
  ensure(!("stock" in publicProduct.record.variants[0]) && !("stockVersion" in publicProduct.record.variants[0]), "public_stock_count_exposed");
  ensure(publicProduct.record.variants[0].effectivePricePaise === 100_000 && publicProduct.record.variants[0].isOnSale === false,
    "future_sale_applied_early");
  ensure(publishedBody.record.publishedRevisionId, "published_product_revision_missing");

  const activeSale = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH",
    json: {
      expectedVersion: 1,
      regularPaise: 100_000,
      salePaise: 90_000,
      saleFrom: new Date(Date.now() - 60 * 60_000).toISOString(),
      saleUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
      reason: `Active sale fixture ${state.runId}`,
    },
  });
  const activeSaleBody = await checkJsonResponse(activeSale, 200, "active_sale_update_failed");
  ensure(activeSaleBody.variant.priceVersion === 2, "active_sale_version_wrong");
  const activePublicResponse = await request(context, `/api/published/products/${product.slug}`, null);
  const activePublic = await checkJsonResponse(activePublicResponse, 200, "active_sale_product_unavailable");
  ensure(activePublic.record.variants?.[0]?.effectivePricePaise === 90_000 && activePublic.record.variants[0].isOnSale === true,
    "active_sale_not_applied");

  const expiredSale = await request(context, `/api/admin/pricing/${variantId}`, auth.staff.appToken, {
    method: "PATCH",
    json: {
      expectedVersion: 2,
      regularPaise: 100_000,
      salePaise: 90_000,
      saleFrom: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      saleUntil: new Date(Date.now() - 60 * 60_000).toISOString(),
      reason: `Expired sale fixture ${state.runId}`,
    },
  });
  const expiredSaleBody = await checkJsonResponse(expiredSale, 200, "expired_sale_update_failed");
  ensure(expiredSaleBody.variant.priceVersion === 3, "expired_sale_version_wrong");
  const expiredPublicResponse = await request(context, `/api/published/products/${product.slug}`, null);
  const expiredPublic = await checkJsonResponse(expiredPublicResponse, 200, "expired_sale_product_unavailable");
  ensure(expiredPublic.record.variants?.[0]?.effectivePricePaise === 100_000 && expiredPublic.record.variants[0].isOnSale === false,
    "expired_sale_still_applied");

  ensure(categoryA, "linked_category_fixture_missing");
  const categoryVersion = await getAdminRecord(context, auth, "categories", categoryA.id);
  const archiveLinked = await request(context, `/api/admin/categories/${categoryA.id}/archive`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: categoryVersion.version },
  });
  checkStatus(archiveLinked, 409, "referenced_category_archived");
}

async function webpFixture() {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 46, g: 142, b: 104 } } }).webp().toBuffer();
}

async function pngFixture() {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 46, g: 142, b: 104 } } }).png().toBuffer();
}

async function uploadImage(context, state, auth, suffix = "image") {
  const file = new File([await pngFixture()], `${suffix}.png`, { type: "image/png" });
  const form = new FormData();
  form.set("file", file);
  form.set("altText", `Disposable Phase 3 test image ${state.runId}`);
  form.set("source", "Synthetic integration fixture");
  const response = await request(context, "/api/admin/media", auth.staff.appToken, {
    method: "POST", headers: { origin: context.appOrigin }, body: form,
  });
  const body = await checkJsonResponse(response, 201, "media_upload_failed");
  const media = body.media;
  ensure(media?.id && media.mimeType === "image/webp" && media.width === 2 && media.height === 2, "media_upload_dto_invalid");
  const key = `assets/${media.id}.webp`;
  state.media.push({ id: media.id, key });
  await checkpoint(state);
  return media;
}

export async function verifyMediaRejections(context, auth) {
  const storageKeys = async () => {
    const keys = new Set();
    const pageSize = 200;
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    while (offset < total) {
      const result = await context.admin.storage.from(mediaBucketName).list({ limit: pageSize, offset });
      const page = result.data?.data;
      const pagination = result.data?.pagination;
      ensure(!result.error && Array.isArray(page) && Number.isSafeInteger(pagination?.total), "media_rejection_storage_snapshot_failed");
      total = pagination.total;
      ensure(total <= 10_000, "media_rejection_storage_snapshot_too_large");
      for (const item of page) {
        ensure(item.bucket === mediaBucketName && typeof item.key === "string", "media_rejection_storage_object_shape_invalid");
        keys.add(item.key);
      }
      if (page.length === 0) break;
      offset += page.length;
    }
    return keys;
  };
  const before = await storageKeys();
  const cases = [
    { label: "svg_spoofed_as_webp", file: new File(["<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>"], "spoofed-svg.webp", { type: "image/webp" }), status: 400 },
    { label: "html_spoofed_as_webp", file: new File(["<!doctype html><script>alert(1)</script>"], "spoofed-html.webp", { type: "image/webp" }), status: 400 },
    { label: "empty_image", file: new File([], "empty.png", { type: "image/png" }), status: 400 },
    { label: "malformed_image_bytes", file: new File([Uint8Array.of(0, 1, 2, 3, 4)], "malformed.png", { type: "image/png" }), status: 400 },
    { label: "oversized_media_request", file: new File([new Uint8Array(5 * 1024 * 1024)], "oversized.png", { type: "image/png" }), status: 413 },
  ];

  for (const { label, file, status } of cases) {
    const form = new FormData();
    form.set("file", file);
    form.set("altText", `Rejected Phase 3 test fixture ${label}`);
    form.set("source", "Synthetic rejection test");
    const response = await request(context, "/api/admin/media", auth.staff.appToken, {
      method: "POST", headers: { origin: context.appOrigin }, body: form,
    });
    checkStatus(response, status, `media_${label}_status_invalid`);
    await response.arrayBuffer();
  }

  const after = await storageKeys();
  ensure(after.size === before.size && [...after].every((key) => before.has(key)), "rejected_media_request_wrote_storage_object");
}

export async function verifyMediaBoundary(context, state, auth, created) {
  const customerUpload = await request(context, "/api/admin/media", auth.customer.appToken, { method: "GET" });
  checkStatus(customerUpload, 403, "customer_media_access_allowed");
  await verifyMediaRejections(context, auth);
  const publicImage = await uploadImage(context, state, auth);
  const publicKey = `assets/${publicImage.id}.webp`;
  const privateGet = await request(context, `/api/media/${publicImage.id}`, null);
  checkStatus(privateGet, 404, "draft_media_downloadable_anonymously");
  for (const size of [96, 960]) {
    checkStatus(await request(context, `/api/media/${publicImage.id}?w=${size}`, null), 404, "draft_derivative_public");
    checkStatus(await request(context, `/api/media/${publicImage.id}?w=${size}`, auth.customer.appToken), 404, "customer_draft_derivative_access");
    const staffPreview = await request(context, `/api/media/${publicImage.id}?w=${size}`, auth.staff.appToken);
    checkStatus(staffPreview, 200, "staff_derivative_denied");
    ensure(staffPreview.headers.get("cache-control")?.includes("no-store"), "private_derivative_cached");
    const preview = await sharp(Buffer.from(await staffPreview.arrayBuffer())).metadata();
    ensure(preview.format === "webp" && preview.width <= size && preview.height <= size, "private_derivative_dimensions");
  }
  const anonClient = createClient({ baseUrl: context.baseUrl, anonKey: process.env.INSFORGE_ANON_KEY.trim() });
  const draftStorageRead = await anonClient.storage.from(mediaBucketName).download(publicKey);
  ensure(Boolean(draftStorageRead.error) || !draftStorageRead.data, "draft_media_storage_readable_anonymously");
  const staffGet = await request(context, `/api/media/${publicImage.id}`, auth.staff.appToken);
  checkStatus(staffGet, 200, "draft_media_unavailable_to_staff");
  ensure(staffGet.headers.get("content-type") === "image/webp" && staffGet.headers.get("cache-control")?.includes("no-store"), "media_download_headers_unsafe");

  const staffDb = auth.staff.database;
  const storedObject = await staffDb.storage.from(mediaBucketName).download(publicKey);
  ensure(!storedObject.error && storedObject.data, "stored_normalized_media_unavailable");
  const storedBytes = Buffer.from(await storedObject.data.arrayBuffer());
  ensure(Buffer.from(await staffGet.arrayBuffer()).equals(storedBytes), "staff_media_reencoded_on_read");
  const imageBytes = await webpFixture();
  const directOverwrite = await staffDb.storage.from(mediaBucketName).upload(publicKey, new File([imageBytes], "overwrite.webp", { type: "image/webp" }));
  ensure(Boolean(directOverwrite.error), "media_object_overwrite_allowed");

  const nullDimensionId = randomUUID();
  const nullDimensionKey = `assets/${nullDimensionId}.webp`;
  state.storageKeys.push({ id: nullDimensionId, key: nullDimensionKey });
  await checkpoint(state);
  const directUpload = await staffDb.storage.from(mediaBucketName).upload(nullDimensionKey, new File([imageBytes], "null-dimension.webp", { type: "image/webp" }));
  ensure(!directUpload.error && directUpload.data?.key === nullDimensionKey, "direct_media_fixture_upload_failed");
  const nullDimension = await rpc(staffDb, "admin_register_media", {
    p_id: nullDimensionId, p_key: nullDimensionKey, p_url: directUpload.data.url, p_filename: "null-dimension.webp",
    p_mime: "image/webp", p_size: imageBytes.byteLength, p_width: null, p_height: null,
    p_alt: `Null dimensions ${state.runId}`, p_source: "Synthetic regression fixture",
  });
  ensure(Boolean(nullDimension.error), "null_image_dimensions_accepted_by_rpc");

  const publishResponse = await request(context, `/api/admin/media/${publicImage.id}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: publicImage.version, altText: publicImage.altText, source: publicImage.source, published: true },
  });
  const published = await checkJsonResponse(publishResponse, 200, "media_publish_failed");
  const directPublishedDownload = await anonClient.storage.from(mediaBucketName).download(publicKey);
  ensure(directPublishedDownload.error?.statusCode === 403 || (!directPublishedDownload.error && directPublishedDownload.data?.size > 0),
    "published_media_storage_gate_unexpected");
  const publicDownload = await request(context, `/api/media/${publicImage.id}`, null);
  if (publicDownload.status !== 200) {
    const problem = await publicDownload.clone().json().catch(() => null);
    ensure(false, `published_media_download_failed_${publicDownload.status}_${problem?.error?.code ?? "unknown"}`);
  }
  checkStatus(publicDownload, 200, "published_media_download_failed");
  ensure(publicDownload.headers.get("content-type") === "image/webp" && publicDownload.headers.get("cache-control")?.includes("no-store"),
    "published_media_download_headers_invalid");
  const publicBytes = Buffer.from(await publicDownload.arrayBuffer());
  ensure(publicBytes.equals(storedBytes), "public_media_reencoded_on_read");
  for (const size of [96, 960]) {
    const preview = await request(context, `/api/media/${publicImage.id}?w=${size}`, null);
    checkStatus(preview, 200, "public_derivative_unavailable");
    ensure(preview.headers.get("cache-control")?.includes("no-store") && preview.headers.get("content-type") === "image/webp", "public_derivative_headers");
    const image = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
    ensure(image.width <= size && image.height <= size, "public_derivative_unbounded");
  }
  for (const invalid of ["w=1", "w=99999", "w=96&w=960", "w="]) {
    checkStatus(await request(context, `/api/media/${publicImage.id}?${invalid}`, null), 400, "invalid_derivative_size_accepted");
  }
  const publicImageMetadata = await sharp(publicBytes).metadata();
  ensure(publicBytes.byteLength > 0 && publicImageMetadata.format === "webp" && publicImageMetadata.width === 2 && publicImageMetadata.height === 2,
    "published_media_download_bytes_invalid");

  const page = created.get("pages");
  ensure(page, "page_fixture_missing_for_media_reference");
  const referencedDocument = { ...documentFor("pages", state.runId, "media-reference"), blocks: [{ type: "image", mediaId: publicImage.id, alt: `Fixture ${state.runId}` }] };
  const referenced = await updateRecord(context, state, auth, "pages", page, referencedDocument);
  ensure(referenced.document.blocks[0]?.mediaId === publicImage.id, "media_reference_not_saved");
  const archive = await request(context, `/api/admin/media/${publicImage.id}/archive`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: published.media.version },
  });
  checkStatus(archive, 409, "referenced_media_archived");
  const unreferencedDocument = {
    ...referencedDocument,
    blocks: [{ type: "paragraph", text: `Media reference removed ${state.runId}.` }],
  };
  await updateRecord(context, state, auth, "pages", referenced, unreferencedDocument);
  const withdrawResponse = await request(context, `/api/admin/media/${publicImage.id}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: 2, altText: publicImage.altText, source: publicImage.source, published: false },
  });
  const withdrawn = await checkJsonResponse(withdrawResponse, 200, "media_withdraw_failed");
  ensure(withdrawn.media.version === 3 && !withdrawn.media.published, "media_withdraw_version_or_state_wrong");
  checkStatus(await request(context, `/api/media/${publicImage.id}`, null), 404, "withdrawn_media_still_public");
  for (const size of [96, 960]) checkStatus(await request(context, `/api/media/${publicImage.id}?w=${size}`, null), 404, "withdrawn_derivative_public");
  const archiveUnreferenced = await request(context, `/api/admin/media/${publicImage.id}/archive`, auth.staff.appToken, {
    method: "POST", json: { expectedVersion: 3 },
  });
  const archived = await checkJsonResponse(archiveUnreferenced, 200, "unreferenced_media_archive_failed");
  ensure(archived.media.archived, "unreferenced_media_not_archived");
  checkStatus(await request(context, `/api/media/${publicImage.id}`, null), 404, "archived_media_still_public");
  for (const size of [96, 960]) checkStatus(await request(context, `/api/media/${publicImage.id}?w=${size}`, null), 404, "archived_derivative_public");
}

export async function verifyInquiryBoundary(context, state, auth) {
  const email = `${state.runId}@phase3-test.example`;
  const submissions = [];
  for (let index = 0; index < 5; index += 1) {
    const idempotencyKey = randomUUID();
    const input = { challengeToken: "XXXX.DUMMY.TOKEN.XXXX", name: `Phase3 ${index}`, email, phone: "", subject: `Fixture ${state.runId} ${index}`, message: `Private fixture message ${state.runId} #${index}`, idempotencyKey };
    const response = await request(context, "/api/contact", null, { method: "POST", json: input });
    const body = await checkJsonResponse(response, 201, "contact_submission_failed");
    ensure(body.receipt && body.notificationStatus === "unconfigured", "contact_receipt_missing");
    state.inquiries.push({ id: body.receipt, requestId: idempotencyKey });
    submissions.push({ input, body });
    await checkpoint(state);
  }
  const replay = await request(context, "/api/contact", null, { method: "POST", json: submissions[0].input });
  const replayBody = await checkJsonResponse(replay, 201, "contact_idempotency_replay_failed");
  ensure(replayBody.receipt === submissions[0].body.receipt, "contact_replay_created_duplicate");
  const collision = await request(context, "/api/contact", null, { method: "POST", json: { ...submissions[0].input, message: "Changed request payload" } });
  checkStatus(collision, 409, "contact_idempotency_payload_collision_accepted");
  const rateLimited = await request(context, "/api/contact", null, { method: "POST", json: {
    ...submissions[0].input, idempotencyKey: randomUUID(), subject: `Sixth ${state.runId}`,
  } });
  checkStatus(rateLimited, 429, "contact_per_email_rate_limit_missing");

  const inquiryId = submissions[0].body.receipt;
  checkStatus(await request(context, `/api/admin/inquiries/${inquiryId}`, auth.customer.appToken), 403, "customer_inquiry_read_allowed");
  const detail = await request(context, `/api/admin/inquiries/${inquiryId}`, auth.staff.appToken);
  const detailBody = await checkJsonResponse(detail, 200, "staff_inquiry_read_failed");
  ensure(detailBody.inquiry?.message === submissions[0].input.message && Array.isArray(detailBody.inquiry.notes), "private_inquiry_detail_missing");
  const update = await request(context, `/api/admin/inquiries/${inquiryId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: detailBody.inquiry.version, status: "in_progress", note: `Staff-only fixture note ${state.runId}` },
  });
  const updated = await checkJsonResponse(update, 200, "inquiry_status_update_failed");
  ensure(updated.inquiry.status === "in_progress" && updated.inquiry.notes.some((note) => note.text.includes(state.runId)), "inquiry_note_missing");
  const stale = await request(context, `/api/admin/inquiries/${inquiryId}`, auth.staff.appToken, {
    method: "PATCH", json: { expectedVersion: detailBody.inquiry.version, status: "resolved", note: "Stale update" },
  });
  checkStatus(stale, 409, "stale_inquiry_update_accepted");

  await grantCapability(context, state.staffUserId, "inquiries.manage", false, state.runId);
  checkStatus(await request(context, "/api/admin/inquiries?limit=1", auth.staff.appToken), 403, "revoked_inquiry_capability_allowed");
  await grantCapability(context, state.staffUserId, "inquiries.manage", true, state.runId);
}

export async function ensureOwnedCleanup(context, state) {
  const userIds = state.users.map((fixture) => fixture.userId);
  const staffId = state.staffUserId;
  const runId = state.runId;
  const verifiedRecords = new Map();
  const kindToModule = { product: "products", category: "categories", blog: "blog", page: "pages", faq: "faqs", team: "team", navigation: "navigation", contact: "contact", solution: "solutions", resource: "learn", video: "videos" };

  const actorRecords = await table(context.admin, "cms_records").select("id,kind,slug,draft,created_by").eq("created_by", staffId).limit(1000);
  ensure(!actorRecords.error, "cleanup_actor_record_discovery_failed");
  for (const row of asArray(actorRecords.data)) {
    if (row.draft?.title?.startsWith(`Phase3 ${runId} `) && !state.records.some((record) => record.id === row.id)) {
      ensure(kindToModule[row.kind], "cleanup_discovered_record_kind_invalid");
      state.records.push({ id: row.id, module: kindToModule[row.kind], kind: row.kind, slug: row.slug });
    }
  }
  const actorMedia = await table(context.admin, "cms_media").select("id,object_key,created_by,alt_text").eq("created_by", staffId).limit(1000);
  ensure(!actorMedia.error, "cleanup_actor_media_discovery_failed");
  for (const row of asArray(actorMedia.data)) {
    if (row.alt_text?.includes(runId) && !state.media.some((media) => media.id === row.id)) {
      ensure(row.object_key === `assets/${row.id}.webp` || row.object_key === `assets/${row.id}.pdf`, "cleanup_discovered_media_key_invalid");
      state.media.push({ id: row.id, key: row.object_key });
    }
  }
  const actorInquiries = await table(context.admin, "inquiries").select("id,email,request_id").eq("email", `${runId}@phase3-test.example`).limit(100);
  ensure(!actorInquiries.error, "cleanup_actor_inquiry_discovery_failed");
  for (const row of asArray(actorInquiries.data)) {
    if (!state.inquiries.some((inquiry) => inquiry.id === row.id)) state.inquiries.push({ id: row.id, requestId: row.request_id });
  }

  const ids = [...new Set(state.records.map((record) => record.id))];
  const mediaIds = [...new Set(state.media.map((media) => media.id))];
  const inquiryIds = [...new Set(state.inquiries.map((inquiry) => inquiry.id))];
  for (const item of state.media) ensure(item.key === `assets/${item.id}.webp` || item.key === `assets/${item.id}.pdf`, "cleanup_media_key_tracker_mismatch");
  for (const item of state.storageKeys) ensure(item?.key === `assets/${item?.id}.webp` || item?.key === `assets/${item?.id}.pdf`, "cleanup_orphan_key_tracker_mismatch");
  const mediaKeys = [...new Set([...state.media.map((item) => item.key), ...state.storageKeys.map((item) => item.key)])];
  for (const key of mediaKeys) ensure(/^assets\/[0-9a-f-]{36}\.(webp|pdf)$/i.test(key), "cleanup_media_key_invalid");
  let verifiedObjectKeys = [];
  if (mediaIds.length) {
    const media = await table(context.admin, "cms_media").select("id,object_key,created_by,alt_text").in("id", mediaIds);
    ensure(!media.error, "cleanup_media_ownership_read_failed");
    for (const row of asArray(media.data)) {
      ensure(row.created_by === staffId && row.alt_text?.includes(runId) && state.media.some(({ id, key }) => id === row.id && key === row.object_key), "cleanup_media_ownership_mismatch");
    }
  }
  const unregisteredKeys = [...new Set(state.storageKeys.map((item) => item.key))];
  if (unregisteredKeys.length) {
    const registered = await table(context.admin, "cms_media").select("id,object_key").in("object_key", unregisteredKeys);
    ensure(!registered.error && asArray(registered.data).length === 0, "cleanup_orphan_key_has_media_metadata");
  }
  if (mediaKeys.length) {
    for (const key of mediaKeys) {
      const listing = await context.admin.storage.from(mediaBucketName).list({ prefix: key, limit: 10 });
      ensure(!listing.error && Array.isArray(listing.data?.data), "cleanup_storage_uploader_read_failed");
      const matches = listing.data.data.filter((row) => row.key === key);
      for (const row of matches) {
        ensure(row.bucket === mediaBucketName && row.uploaded_by === staffId, "cleanup_storage_uploader_mismatch");
      }
      if (matches.length) verifiedObjectKeys.push(key);
    }
  }

  if (ids.length) {
    const records = await table(context.admin, "cms_records").select("id,kind,slug,draft,created_by").in("id", ids);
    ensure(!records.error, "cleanup_record_ownership_read_failed");
    for (const row of asArray(records.data)) {
      ensure(row.created_by === staffId && row.draft?.title?.startsWith(`Phase3 ${runId} `), "cleanup_record_ownership_mismatch");
      const expected = state.records.find((record) => record.id === row.id);
      ensure(expected?.kind === row.kind, "cleanup_record_kind_mismatch");
      verifiedRecords.set(row.id, row);
    }
  }
  const fixtureProductIds = [...new Set(state.records.filter((record) => record.module === "products").map((record) => record.id))];
  let existingVariants = [];
  if (fixtureProductIds.length) {
    const variants = await table(context.admin, "catalog_variants").select("id,product_id,sku").in("product_id", fixtureProductIds);
    ensure(!variants.error, "cleanup_variant_ownership_read_failed");
    existingVariants = asArray(variants.data);
    for (const row of existingVariants) {
      const parent = verifiedRecords.get(row.product_id);
      const tracked = state.variants.find((variant) => variant.id === row.id);
      ensure(parent?.kind === "product" && parent.created_by === staffId, "cleanup_variant_parent_not_owned");
      ensure(parent.draft?.variants?.some((variant) => variant.id === row.id && variant.sku === row.sku), "cleanup_variant_not_in_owned_product_document");
      ensure(!tracked || (tracked.productId === row.product_id && tracked.sku === row.sku), "cleanup_variant_tracker_mismatch");
    }
  }
  const trackedVariantIds = [...new Set(state.variants.map((variant) => variant.id))];
  if (trackedVariantIds.length) {
    const trackedRows = await table(context.admin, "catalog_variants").select("id,product_id,sku").in("id", trackedVariantIds);
    ensure(!trackedRows.error, "cleanup_tracked_variant_ownership_read_failed");
    for (const row of asArray(trackedRows.data)) {
      const tracker = state.variants.find((variant) => variant.id === row.id);
      const parent = verifiedRecords.get(row.product_id);
      ensure(tracker?.productId === row.product_id && tracker.sku === row.sku && parent?.kind === "product" && parent.created_by === staffId,
        "cleanup_tracked_variant_parent_not_owned");
    }
  }
  const variantIds = [...new Set([...state.variants.map((variant) => variant.id), ...existingVariants.map((variant) => variant.id)])];
  if (inquiryIds.length) {
    const inquiries = await table(context.admin, "inquiries").select("id,email,request_id").in("id", inquiryIds);
    ensure(!inquiries.error, "cleanup_inquiry_ownership_read_failed");
    for (const row of asArray(inquiries.data)) {
      ensure(row.email === `${runId}@phase3-test.example` && state.inquiries.some((item) => item.requestId === row.request_id), "cleanup_inquiry_ownership_mismatch");
    }
  }

  const deleteBy = async (name, column, values) => {
    if (!values.length) return;
    const { error } = await table(context.admin, name).delete().in(column, values);
    ensure(!error, `cleanup_${name}_failed`);
  };
  const deleteEventsByActor = async () => {
    const { error } = await table(context.admin, "cms_audit_events").delete().in("actor", userIds);
    ensure(!error, "cleanup_audit_actor_events_failed");
  };

  if (variantIds.length) {
    await deleteBy("inventory_movements", "variant_id", variantIds);
    await deleteBy("variant_price_events", "variant_id", variantIds);
    await deleteBy("inventory_balances", "variant_id", variantIds);
  }
  if (ids.length) {
    await deleteBy("product_categories", "product_id", ids);
    await deleteBy("product_categories", "category_id", ids);
    await deleteBy("cms_live_routes", "record_id", ids);
    await deleteBy("cms_slug_redirects", "record_id", ids);
  }
  if (mediaIds.length) await deleteBy("editorial_media_events", "media_id", mediaIds);
  if (inquiryIds.length) {
    await deleteBy("inquiry_notes", "inquiry_id", inquiryIds);
    await deleteBy("inquiry_notifications", "inquiry_id", inquiryIds);
  }
  await deleteEventsByActor();
  if (variantIds.length) await deleteBy("catalog_variants", "id", variantIds);
  if (ids.length) {
    const nullSources = await table(context.admin, "cms_revisions").update({ source_revision_id: null }).in("record_id", ids);
    ensure(!nullSources.error, "cleanup_revision_source_clear_failed");
    const clearRecordPointers = await table(context.admin, "cms_records").update({ published_revision_id: null, draft_source_revision_id: null }).in("id", ids);
    ensure(!clearRecordPointers.error, "cleanup_record_revision_pointer_clear_failed");
    await deleteBy("cms_revisions", "record_id", ids);
    await deleteBy("cms_records", "id", ids);
  }
  if (inquiryIds.length) await deleteBy("inquiries", "id", inquiryIds);
  if (mediaIds.length) await deleteBy("cms_media", "id", mediaIds);
  if (verifiedObjectKeys.length) {
    const { error } = await context.admin.storage.from(mediaBucketName).remove(verifiedObjectKeys);
    ensure(!error, "cleanup_media_storage_failed");
  }
  await cleanFixtures(context, state.users, runId);
}

async function cleanupStoredFixtures(context) {
  let state;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new HarnessFailure("phase3_fixture_file_unavailable");
  }
  ensure(
    state && /^[0-9a-f-]{36}$/i.test(state.runId) && Array.isArray(state.users) && state.users.length === 2 &&
    Array.isArray(state.records) && Array.isArray(state.variants) && Array.isArray(state.media) &&
    Array.isArray(state.storageKeys) && Array.isArray(state.inquiries),
    "invalid_phase3_fixture_file",
  );
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(roles.size === 2 && roles.has("customer") && roles.has("staff"), "invalid_phase3_fixture_roles");
  for (const fixture of state.users) {
    ensure(fixture.runId === state.runId, "phase3_fixture_run_id_mismatch");
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  state.staffUserId = state.users.find(({ role }) => role === "staff").userId;
  await ensureOwnedCleanup(context, state);
  await unlink(fixturePath);
  return state.users.length;
}

async function run(context, keepFixtures) {
  try {
    await readFile(fixturePath, "utf8");
    throw new HarnessFailure("phase3_fixture_file_already_exists_use_cleanup");
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    if (error?.code !== "ENOENT") throw new HarnessFailure("phase3_fixture_file_unavailable");
  }

  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [] };
  let primaryFailure = null;
  let activePhase = "fixture_creation";
  try {
    console.log("Phase 3: fixture_creation.");
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => {
      state.users.push(fixture);
    });
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff").userId;
    const auth = fixtures.auth;
    await checkpoint(state);

    activePhase = "capability_isolation";
    console.log("Phase 3: capability_isolation.");
    await verifyInitialCapabilities(context, state, auth);
    await checkpoint(state);
    activePhase = "legacy_anonymous_boundaries";
    console.log("Phase 3: legacy_anonymous_boundaries.");
    await verifyLegacyAnonymousBoundaries(context, state, auth);
    activePhase = "closed_module_validators";
    console.log("Phase 3: closed_module_validators.");
    await verifyClosedModuleValidators(context, state, auth);
    activePhase = "access_boundaries";
    console.log("Phase 3: access_boundaries.");
    await verifyAccessBoundaries(context, state, auth);
    activePhase = "module_records";
    console.log("Phase 3: module_records.");
    const created = await verifyModuleRecords(context, state, auth);
    activePhase = "category_graph_and_sku";
    console.log("Phase 3: category_graph_and_sku.");
    const graph = await verifyCategoryGraphAndSku(context, state, auth, created);
    activePhase = "pricing_and_inventory";
    console.log("Phase 3: pricing_and_inventory.");
    await verifyProductPricesAndInventory(context, state, auth, graph.product, graph.categoryA);
    activePhase = "publishing_and_restore";
    console.log("Phase 3: publishing_and_restore.");
    await verifyPublishingAndRestore(context, state, auth);
    activePhase = "media_boundary";
    console.log("Phase 3: media_boundary.");
    await verifyMediaBoundary(context, state, auth, created);
    activePhase = "inquiry_boundary";
    console.log("Phase 3: inquiry_boundary.");
    await verifyInquiryBoundary(context, state, auth);
    activePhase = "harness_completion";
    ensure(keepFixtures === true || keepFixtures === false, "invalid_keep_fixture_state");
    console.log("Phase 3 development integration checks passed.");
  } catch (error) {
    if (error instanceof HarnessFailure) {
      primaryFailure = error;
    } else {
      console.error(`Phase 3 safe diagnostic: ${safeUnknownErrorSummary(error)}.`);
      primaryFailure = new HarnessFailure(`${activePhase}_failed`);
    }
  } finally {
    activePhase = "fixture_cleanup";
    if (keepFixtures && state.users.length === 2) {
      try {
        console.log("Phase 3: fixture_checkpoint.");
        await checkpoint(state);
        console.log("Disposable Phase 3 fixtures retained in .bootstrap/phase3-test-fixtures.json.");
      } catch {
        primaryFailure ??= new HarnessFailure("phase3_fixture_checkpoint_failed");
      }
    } else if (state.users.length === 2) {
      try {
        console.log("Phase 3: fixture_cleanup.");
        await ensureOwnedCleanup(context, state);
        await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
        console.log("All verified Phase 3 fixtures were removed.");
      } catch (error) {
        try { await checkpoint(state); } catch { /* Keep the original cleanup label. */ }
        if (!(error instanceof HarnessFailure)) console.error(`Phase 3 cleanup diagnostic: ${safeUnknownErrorSummary(error)}.`);
        primaryFailure ??= error instanceof HarnessFailure ? error : new HarnessFailure("fixture_cleanup_failed");
      }
    } else if (state.users.length > 0) {
      try {
        await cleanFixtures(context, state.users, state.runId);
      } catch {
        primaryFailure ??= new HarnessFailure("partial_fixture_cleanup_failed");
      }
    }
  }
  if (primaryFailure) throw primaryFailure;
}

async function main() {
  let args;
  try {
    args = parseArguments();
  } catch (error) {
    console.error(`Phase 3 harness stopped safely: ${error instanceof HarnessFailure ? error.label : "invalid_command_line"}.`);
    process.exitCode = 2;
    return;
  }
  let context;
  try {
    context = await preflight();
  } catch (error) {
    console.error(`Phase 3 harness preflight failed safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  if (args.cleanupOnly) {
    try {
      const count = await cleanupStoredFixtures(context);
      console.log(`Cleanup completed for ${count} verified disposable fixture users.`);
    } catch (error) {
      console.error(`Phase 3 cleanup stopped safely: ${error instanceof HarnessFailure ? error.label : "phase3_cleanup_failed"}.`);
      process.exitCode = 1;
    }
    return;
  }
  try {
    await run(context, args.keepFixtures);
  } catch (error) {
    console.error(`Phase 3 integration harness failed safely: ${error instanceof HarnessFailure ? error.label : "phase3_integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
