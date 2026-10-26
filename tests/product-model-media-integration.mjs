import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@insforge/sdk";
import sharp from "sharp";
import {
  appRequest,
  cleanFixtures,
  createFixtures,
  createRuntimeClient,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";
import { ensureOwnedCleanup, getAdminRecord, transition } from "./phase3-publishing.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "product-model-media-fixtures.json");
const fixtureCapabilities = ["catalog.edit", "content.publish", "media.manage"];
const mediaBucket = "editorial-media";

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

async function request(context, route, token, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
  }
  return appRequest(context.appOrigin, route, token, {
    ...options,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    headers,
  });
}

async function jsonResponse(response, status, label) {
  if (response.status !== status) {
    let code = "unknown";
    try {
      const body = await response.clone().json();
      const candidate = body?.error?.code;
      if (typeof candidate === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(candidate)) code = candidate;
    } catch { /* Keep diagnostics to a bounded API code only. */ }
    throw new HarnessFailure(`${label}_status_${response.status}_${code}`);
  }
  return safeJson(response, `${label}_json_invalid`);
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
    modelMedia: state.modelMedia,
  };
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

function parseArguments() {
  const args = new Set(process.argv.slice(2));
  ensure([...args].every((arg) => arg === "--keep-fixtures" || arg === "--cleanup"), "invalid_command_line");
  ensure(!(args.has("--keep-fixtures") && args.has("--cleanup")), "invalid_command_line");
  return { keepFixtures: args.has("--keep-fixtures"), cleanupOnly: args.has("--cleanup") };
}

function titleFor(runId, suffix) {
  return `Phase3 ${runId} ${suffix}`;
}

function slugFor(runId, suffix) {
  return `p3-${runId.slice(0, 8)}-${suffix}`;
}

function categoryDocument(runId) {
  return {
    title: titleFor(runId, "3d-category"),
    slug: slugFor(runId, "3d-category"),
    summary: `Disposable product-model category ${runId}.`,
    blocks: [{ type: "paragraph", text: `Synthetic 3D integration fixture ${runId}.` }],
    seoTitle: titleFor(runId, "3d-category"),
    seoDescription: `Synthetic integration fixture ${runId}.`,
    parentId: null,
    position: 0,
    mediaIds: [],
  };
}

function productDocument(runId, categoryId, model3d) {
  return {
    title: titleFor(runId, "3d-product"),
    slug: slugFor(runId, "3d-product"),
    summary: `Disposable synthetic 3D media fixture ${runId}.`,
    blocks: [{ type: "paragraph", text: `Synthetic test content ${runId}.` }],
    seoTitle: titleFor(runId, "3d-product"),
    seoDescription: `Synthetic integration fixture ${runId}.`,
    categoryIds: [categoryId],
    modelNumbers: [],
    variants: [{ sku: `PM3-${runId.slice(0, 8)}-FIXTURE`.toUpperCase(), label: "Synthetic test variant" }],
    specifications: [],
    compatibility: [],
    kitContents: [],
    resources: [],
    mediaIds: [],
    model3d,
  };
}

function tinyTriangleGlb() {
  const binary = Buffer.alloc(44);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  binary.writeUInt16LE(0, 36);
  binary.writeUInt16LE(1, 38);
  binary.writeUInt16LE(2, 40);

  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: 42 }],
  };
  const json = Buffer.from(JSON.stringify(document), "utf8");
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const jsonChunk = Buffer.alloc(jsonLength, 0x20);
  json.copy(jsonChunk);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binary.length);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

async function pngFixture() {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 46, g: 142, b: 104 } } }).png().toBuffer();
}

async function uploadMedia(context, auth, state, { bytes, filename, mimeType, altText, source, publicUseAllowed }) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], filename, { type: mimeType }));
  form.set("altText", altText);
  form.set("source", source);
  if (publicUseAllowed !== undefined) form.set("publicUseAllowed", String(publicUseAllowed));
  const response = await request(context, "/api/admin/media", auth.staff.appToken, {
    method: "POST",
    headers: { origin: context.appOrigin },
    body: form,
  });
  const body = await jsonResponse(response, 201, "synthetic_media_upload");
  if (body.media?.id && body.media.mimeType === "model/gltf-binary") {
    state.modelMedia = {
      id: body.media.id,
      key: `assets/${body.media.id}.glb`,
      altText,
      source,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
      version: body.media.version,
      published: false,
      publicUseAllowed: publicUseAllowed === true,
    };
  }
  if (body.media?.id && body.media.mimeType === "image/webp" && !state.media.some((item) => item.id === body.media.id)) {
    state.media.push({ id: body.media.id, key: `assets/${body.media.id}.webp` });
  }
  ensure(body.media?.id && body.media.version === 1, "synthetic_media_upload_dto_invalid");
  if (body.media.mimeType === "model/gltf-binary") {
    ensure(state.modelMedia, "synthetic_model_cleanup_tracker_invalid");
  }
  await checkpoint(state);
  return body.media;
}

async function discoverOwnedFixtureRecords(context, state) {
  const result = await table(context.admin, "cms_records").select("id,kind,slug,draft,created_by").eq("created_by", state.staffUserId).limit(1000);
  ensure(!result.error && Array.isArray(result.data), "fixture_record_cleanup_discovery_failed");
  for (const row of result.data) {
    const suffix = row.kind === "product" ? "3d-product" : row.kind === "category" ? "3d-category" : null;
    if (!suffix || row.draft?.title !== titleFor(state.runId, suffix)) continue;
    const expectedSlug = slugFor(state.runId, suffix);
    ensure(row.created_by === state.staffUserId && row.slug === expectedSlug, "fixture_record_cleanup_discovery_mismatch");
    if (!state.records.some((item) => item.id === row.id)) {
      state.records.push({ id: row.id, module: row.kind === "product" ? "products" : "categories", kind: row.kind, slug: row.slug });
    }
  }
  const product = state.records.find((item) => item.module === "products");
  if (product && !state.record) state.record = { id: product.id };
}

async function discoverOwnedModelMedia(context, state) {
  if (state.modelMedia) return;
  const result = await table(context.admin, "cms_media").select(
    "id,object_key,mime_type,created_by,alt_text,source,model_sha256,byte_size,version,published,model_public_allowed",
  ).eq("created_by", state.staffUserId).eq("mime_type", "model/gltf-binary").limit(1000);
  ensure(!result.error && Array.isArray(result.data), "fixture_model_cleanup_discovery_failed");
  const matches = result.data.filter((row) => typeof row.alt_text === "string" && row.alt_text.includes(state.runId));
  ensure(matches.length <= 1, "fixture_model_cleanup_discovery_ambiguous");
  if (!matches.length) return;
  const row = matches[0];
  ensure(row.created_by === state.staffUserId && row.object_key === `assets/${row.id}.glb` &&
    row.mime_type === "model/gltf-binary" && /^[0-9a-f]{64}$/.test(row.model_sha256 ?? "") &&
    Number.isSafeInteger(row.byte_size) && row.byte_size > 0,
  "fixture_model_cleanup_discovery_mismatch");
  state.modelMedia = {
    id: row.id, key: row.object_key, altText: row.alt_text, source: row.source, sha256: row.model_sha256,
    byteSize: row.byte_size, version: row.version, published: row.published, publicUseAllowed: row.model_public_allowed,
  };
}

async function grantCapability(context, state, capability, enabled) {
  const result = await rpc(context.admin, "set_staff_capability", {
    target_user_id: state.staffUserId,
    capability_name: capability,
    enabled,
    reason: `product-model-media fixture ${state.runId}`,
  });
  ensure(!result.error, `fixture_capability_${enabled ? "grant" : "revoke"}_${capability}_failed`);
}

async function createRecord(context, state, auth, module, document) {
  const response = await request(context, `/api/admin/${module}`, auth.staff.appToken, { method: "POST", json: { document } });
  const body = await jsonResponse(response, 201, `fixture_${module}_create`);
  const record = body.record;
  ensure(record?.id && record.kind, `fixture_${module}_shape_invalid`);
  state.records.push({ id: record.id, module, kind: record.kind, slug: record.slug });
  for (const variant of record.document?.variants ?? []) {
    ensure(variant.id && typeof variant.sku === "string", "fixture_variant_shape_invalid");
    state.variants.push({ id: variant.id, productId: record.id, sku: variant.sku });
  }
  await checkpoint(state);
  return record;
}

async function updateRecord(context, auth, state, record, document, label = "fixture_product_update") {
  const response = await request(context, `/api/admin/products/${record.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: { expectedVersion: record.version, document },
  });
  const body = await jsonResponse(response, 200, label);
  ensure(body.record?.id === record.id, "fixture_product_update_shape_invalid");
  const stored = state.records.find((item) => item.id === record.id);
  if (stored) stored.slug = body.record.slug;
  await checkpoint(state);
  return body.record;
}

async function updateMedia(context, auth, id, patch, status = 200) {
  const response = await request(context, `/api/admin/media/${id}`, auth.staff.appToken, { method: "PATCH", json: patch });
  const body = await jsonResponse(response, status, "fixture_media_update");
  return body.media;
}

async function setFixturePrice(context, auth, variant, runId) {
  const response = await request(context, `/api/admin/pricing/${variant.id}`, auth.staff.appToken, {
    method: "PATCH",
    json: {
      expectedVersion: 0,
      regularPaise: 1234,
      salePaise: null,
      saleFrom: null,
      saleUntil: null,
      reason: `Disposable product-model-media fixture ${runId}`,
    },
  });
  const body = await jsonResponse(response, 200, "fixture_price_set");
  ensure(body.variant?.id === variant.id && body.variant.regularPaise === 1234, "fixture_price_shape_invalid");
}

async function cleanupModelMedia(context, state) {
  const model = state.modelMedia;
  if (!model) return;
  const selected = await table(context.admin, "cms_media").select("id,object_key,mime_type,created_by,alt_text,model_sha256,byte_size").eq("id", model.id);
  ensure(!selected.error && Array.isArray(selected.data) && selected.data.length <= 1, "fixture_model_cleanup_lookup_failed");
  const row = selected.data[0];
  if (row) ensure(row.id === model.id && row.object_key === model.key && row.mime_type === "model/gltf-binary" &&
    row.created_by === state.staffUserId && row.alt_text === model.altText && row.model_sha256 === model.sha256 && row.byte_size === model.byteSize,
  "fixture_model_cleanup_ownership_mismatch");

  const listed = await context.admin.storage.from(mediaBucket).list({ prefix: model.key, limit: 10 });
  ensure(!listed.error && Array.isArray(listed.data?.data), "fixture_model_cleanup_storage_lookup_failed");
  const matches = listed.data.data.filter((item) => item.key === model.key);
  for (const item of matches) ensure(item.bucket === mediaBucket && item.uploaded_by === state.staffUserId, "fixture_model_cleanup_storage_owner_mismatch");
  if (matches.length) {
    const removed = await context.admin.storage.from(mediaBucket).remove([model.key]);
    ensure(!removed.error, "fixture_model_cleanup_storage_failed");
  }
  if (row) {
    const events = await table(context.admin, "editorial_media_events").delete().eq("media_id", model.id);
    ensure(!events.error, "fixture_model_cleanup_events_failed");
    const deleted = await table(context.admin, "cms_media").delete().eq("id", model.id);
    ensure(!deleted.error, "fixture_model_cleanup_metadata_failed");
  }
}

async function cleanup(context, state, auth) {
  await discoverOwnedFixtureRecords(context, state);
  await discoverOwnedModelMedia(context, state);
  if (state.staffUserId && state.users.length === 2) {
    if (state.record) {
      let current = await getAdminRecord(context, auth, "products", state.record.id, "fixture_cleanup_product_read");
      if (current.publishedRevisionId) current = (await transition(context, auth, "products", current, "unpublish")).record;
      if (current.document?.model3d) {
        const document = { ...current.document };
        delete document.model3d;
        current = await updateRecord(context, auth, state, current, document, "fixture_cleanup_product_update");
      }
      state.record = current;
    }
    if (state.modelMedia) {
      const rows = await table(context.admin, "cms_media").select("version,published,model_public_allowed,alt_text,source").eq("id", state.modelMedia.id);
      ensure(!rows.error && Array.isArray(rows.data) && rows.data.length <= 1, "fixture_model_cleanup_state_failed");
      const row = rows.data[0];
      if (row?.published) {
        await updateMedia(context, auth, state.modelMedia.id, {
          expectedVersion: row.version,
          altText: row.alt_text,
          source: row.source,
          published: false,
          publicUseAllowed: row.model_public_allowed,
        });
      }
    }
    await cleanupModelMedia(context, state);
    await ensureOwnedCleanup(context, state);
  } else if (state.users.length) {
    await cleanFixtures(context, state.users, state.runId);
  }
}

async function restoreFixtureAuth(context, state) {
  const auth = {};
  for (const fixture of state.users) {
    const insforgeToken = await context.clerk.sessions.getToken(fixture.sessionId, "insforge");
    ensure(Boolean(insforgeToken.jwt), "fixture_cleanup_token_mint_failed");
    auth[fixture.role] = {
      database: createRuntimeClient(context.baseUrl, insforgeToken.jwt, async () =>
        (await context.clerk.sessions.getToken(fixture.sessionId, "insforge")).jwt),
      appToken: async () => (await context.clerk.sessions.getToken(fixture.sessionId)).jwt,
    };
  }
  return auth;
}

async function cleanupStoredFixtures(context) {
  let state;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch {
    throw new HarnessFailure("product_model_media_fixture_file_unavailable");
  }
  ensure(state && /^[0-9a-f-]{36}$/i.test(state.runId) && Array.isArray(state.users) &&
    state.users.length >= 1 && state.users.length <= 2 && Array.isArray(state.records) &&
    Array.isArray(state.variants) && Array.isArray(state.media) && Array.isArray(state.storageKeys) &&
    Array.isArray(state.inquiries), "product_model_media_fixture_file_invalid");
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(roles.size === state.users.length && [...roles].every((role) => ["customer", "staff"].includes(role)),
    "product_model_media_fixture_roles_invalid");
  for (const fixture of state.users) {
    ensure(fixture.runId === state.runId, "product_model_media_fixture_run_id_mismatch");
    await verifyFixtureOwnership(context.clerk, fixture);
  }
  state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
  state.record ??= (() => {
    const product = state.records.find(({ module }) => module === "products");
    return product ? { id: product.id } : null;
  })();

  try {
    if (state.users.length === 2 && state.staffUserId) {
      const auth = await restoreFixtureAuth(context, state);
      await cleanup(context, state, auth);
    } else {
      await cleanFixtures(context, state.users, state.runId);
    }
    await unlink(fixturePath);
    return state.users.length;
  } catch (error) {
    try { await checkpoint(state); } catch { /* Preserve the primary cleanup diagnostic. */ }
    throw error instanceof HarnessFailure ? error : new HarnessFailure("product_model_media_cleanup_failed");
  }
}

async function run(context, { keepFixtures }) {
  try {
    await readFile(fixturePath, "utf8");
    throw new HarnessFailure("product_model_media_fixture_file_already_exists_use_cleanup");
  } catch (error) {
    if (error instanceof HarnessFailure) throw error;
    if (error?.code !== "ENOENT") throw new HarnessFailure("product_model_media_fixture_file_unavailable");
  }

  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [], modelMedia: null, record: null };
  let primaryFailure = null;
  let auth = null;
  let pendingUserCheckpoint = Promise.resolve();
  let userCheckpointFailed = false;
  try {
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => {
      state.users.push(fixture);
      pendingUserCheckpoint = pendingUserCheckpoint.then(() => checkpoint(state)).catch(() => { userCheckpointFailed = true; });
    });
    await pendingUserCheckpoint;
    ensure(!userCheckpointFailed, "product_model_media_fixture_checkpoint_failed");
    state.users = fixtures.users;
    auth = fixtures.auth;
    state.staffUserId = state.users.find((fixture) => fixture.role === "staff")?.userId ?? "";
    ensure(state.staffUserId && state.users.length === 2, "fixture_users_invalid");
    await checkpoint(state);

    for (const capability of fixtureCapabilities) {
      for (const role of ["staff", "customer"]) {
        const result = await rpc(auth[role].database, "has_capability", { capability_name: capability });
        ensure(!result.error && result.data === false, `fixture_pregranted_${role}_${capability}`);
      }
    }
    for (const capability of fixtureCapabilities) await grantCapability(context, state, capability, true);

    const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
    ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
    const anon = createClient({ baseUrl: context.baseUrl, anonKey, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
    const triangle = tinyTriangleGlb();
    const modelHash = createHash("sha256").update(triangle).digest("hex");

    const deniedUploadForm = new FormData();
    deniedUploadForm.set("file", new File([triangle], "denied.glb", { type: "model/gltf-binary" }));
    deniedUploadForm.set("altText", "Denied synthetic model");
    deniedUploadForm.set("source", "Disposable test");
    const anonymousUpload = await request(context, "/api/admin/media", null, { method: "POST", headers: { origin: context.appOrigin }, body: deniedUploadForm });
    ensure(anonymousUpload.status === 401, "anonymous_model_upload_allowed");
    const customerUploadForm = new FormData();
    customerUploadForm.set("file", new File([triangle], "denied.glb", { type: "model/gltf-binary" }));
    customerUploadForm.set("altText", "Denied synthetic model");
    customerUploadForm.set("source", "Disposable test");
    const customerUpload = await request(context, "/api/admin/media", fixtures.auth.customer.appToken, {
      method: "POST", headers: { origin: context.appOrigin }, body: customerUploadForm,
    });
    ensure(customerUpload.status === 403, "customer_model_upload_allowed");

    const unregisteredModelId = randomUUID();
    const missingProof = await rpc(auth.staff.database, "admin_register_model_media", {
      p_id: unregisteredModelId, p_key: `assets/${unregisteredModelId}.glb`, p_url: "https://example.invalid/unregistered.glb",
      p_filename: "unregistered.glb", p_size: triangle.byteLength, p_alt: "Synthetic invalid proof",
      p_source: "Disposable proof-boundary fixture", p_sha256: modelHash, p_triangles: 1,
      p_public_allowed: false, p_validation_key: randomBytes(32).toString("hex"),
    });
    ensure(missingProof.error?.details === "forbidden" && missingProof.data === null,
      "direct_model_registration_without_server_proof_allowed");

    const poster = await uploadMedia(context, auth, state, {
      bytes: await pngFixture(), filename: "synthetic-poster.png", mimeType: "image/png",
      altText: `Disposable synthetic 3D poster ${state.runId}`, source: `Synthetic integration fixture ${state.runId}`,
    });
    ensure(poster.mimeType === "image/webp" && poster.id !== undefined, "poster_type_invalid");
    const model = await uploadMedia(context, auth, state, {
      bytes: triangle, filename: "synthetic-triangle.glb", mimeType: "model/gltf-binary",
      altText: `Synthetic triangle model ${state.runId}`, source: `Synthetic integration fixture ${state.runId}`, publicUseAllowed: false,
    });
    ensure(model.mimeType === "model/gltf-binary" && model.triangles === 1, "synthetic_glb_registration_invalid");

    const modelRows = await table(context.admin, "cms_media").select("id,object_key,mime_type,byte_size,model_sha256,model_triangles,version,published,model_public_allowed,created_by").eq("id", model.id);
    ensure(!modelRows.error && modelRows.data?.length === 1, "registered_model_row_missing");
    const modelRow = modelRows.data[0];
    ensure(modelRow.object_key === `assets/${model.id}.glb` && modelRow.mime_type === "model/gltf-binary" &&
      modelRow.byte_size === triangle.byteLength && modelRow.model_sha256 === modelHash && modelRow.model_triangles === 1 &&
      modelRow.published === false && modelRow.model_public_allowed === false && modelRow.created_by === state.staffUserId,
    "registered_model_proof_metadata_invalid");

    const privateAnon = await request(context, `/api/media/${model.id}`, null);
    const privateCustomer = await request(context, `/api/media/${model.id}`, auth.customer.appToken);
    ensure(privateAnon.status === 404 && privateCustomer.status === 404, "private_model_readable_without_staff_access");
    const anonStorage = await anon.storage.from(mediaBucket).download(`assets/${model.id}.glb`);
    const customerStorage = await auth.customer.database.storage.from(mediaBucket).download(`assets/${model.id}.glb`);
    ensure(Boolean(anonStorage.error) || !anonStorage.data, "private_model_storage_readable_anonymously");
    ensure(Boolean(customerStorage.error) || !customerStorage.data, "private_model_storage_readable_by_customer");
    const staffPrivate = await request(context, `/api/media/${model.id}`, auth.staff.appToken);
    ensure(staffPrivate.status === 200 && staffPrivate.headers.get("cache-control")?.includes("no-store") &&
      Buffer.from(await staffPrivate.arrayBuffer()).equals(triangle), "staff_private_model_preview_invalid");

    const posterVersionTwo = await updateMedia(context, auth, poster.id, {
      expectedVersion: poster.version, altText: poster.altText, source: poster.source, published: false,
    });
    const stalePoster = await request(context, `/api/admin/media/${poster.id}`, auth.staff.appToken, {
      method: "PATCH", json: { expectedVersion: poster.version, altText: poster.altText, source: poster.source, published: false },
    });
    ensure(stalePoster.status === 409 && posterVersionTwo.version === 2, "poster_version_guard_failed");

    const modelVersionTwo = await updateMedia(context, auth, model.id, {
      expectedVersion: model.version, altText: model.altText, source: model.source,
      published: false, publicUseAllowed: false,
    });
    const staleModel = await request(context, `/api/admin/media/${model.id}`, auth.staff.appToken, {
      method: "PATCH", json: { expectedVersion: model.version, altText: model.altText, source: model.source, published: false, publicUseAllowed: false },
    });
    ensure(staleModel.status === 409 && modelVersionTwo.version === 2, "model_version_guard_failed");

    const category = await createRecord(context, state, auth, "categories", categoryDocument(state.runId));
    const categoryLive = await transition(context, auth, "categories", category, "publish");
    const model3d = { mediaId: model.id, posterId: poster.id, alt: "Synthetic triangle model" };
    const initialDocument = productDocument(state.runId, category.id, model3d);
    const product = await createRecord(context, state, auth, "products", initialDocument);
    state.record = product;
    await setFixturePrice(context, auth, product.document.variants[0], state.runId);
    await checkpoint(state);
    const document = { ...product.document, model3d };

    const badTypedRefs = { ...document, model3d: { mediaId: poster.id, posterId: model.id, alt: "Wrong media types" } };
    const wrongMime = await request(context, `/api/admin/products/${product.id}`, auth.staff.appToken, {
      method: "PATCH", json: { expectedVersion: product.version, document: badTypedRefs },
    });
    ensure([400, 409].includes(wrongMime.status), "wrong_model_poster_mime_references_accepted");

    const updatedProduct = await updateRecord(context, auth, state, product, document, "fixture_product_update_after_wrong_media_refs");
    state.record = updatedProduct;
    await checkpoint(state);
    const staleProduct = await request(context, `/api/admin/products/${product.id}`, auth.staff.appToken, {
      method: "PATCH", json: { expectedVersion: product.version, document },
    });
    ensure(staleProduct.status === 409 && updatedProduct.version > product.version, "product_version_guard_failed");

    await grantCapability(context, state, "content.publish", false);
    const forbiddenPublicUse = await request(context, `/api/admin/media/${model.id}`, auth.staff.appToken, {
      method: "PATCH", json: {
        expectedVersion: modelVersionTwo.version, altText: model.altText, source: model.source,
        published: false, publicUseAllowed: true,
      },
    });
    ensure(forbiddenPublicUse.status === 403, "media_manager_without_publish_capability_approved_model");
    await grantCapability(context, state, "content.publish", true);

    const privatePublish = await request(context, `/api/admin/media/${model.id}`, auth.staff.appToken, {
      method: "PATCH", json: {
        expectedVersion: modelVersionTwo.version, altText: model.altText, source: model.source,
        published: true, publicUseAllowed: false,
      },
    });
    ensure(privatePublish.status === 409, "private_model_published_without_public_use_permission");
    const privateProductPublish = await request(context, `/api/admin/products/${product.id}/publish`, auth.staff.appToken, {
      method: "POST", json: { expectedVersion: updatedProduct.version },
    });
    ensure(privateProductPublish.status === 409, "product_published_with_private_model");

    const eligibleModel = await updateMedia(context, auth, model.id, {
      expectedVersion: modelVersionTwo.version, altText: model.altText, source: model.source,
      published: false, publicUseAllowed: true,
    });
    const publicPoster = await updateMedia(context, auth, poster.id, {
      expectedVersion: posterVersionTwo.version, altText: poster.altText, source: poster.source, published: true,
    });
    const publicModel = await updateMedia(context, auth, model.id, {
      expectedVersion: eligibleModel.version, altText: model.altText, source: model.source,
      published: true, publicUseAllowed: true,
    });
    state.modelMedia = { ...state.modelMedia, version: publicModel.version, published: true, publicUseAllowed: true };
    ensure(publicPoster.published === true && publicModel.published === true && publicModel.publicUseAllowed === true,
      "eligible_model_assets_not_published");

    const published = await transition(context, auth, "products", updatedProduct, "publish");
    state.record = published.record;
    ensure(published.record.publishedRevisionId, "fixture_product_publication_missing");
    const anonRecord = await rpc(anon, "published_get_record", { p_kind: "product", p_slug: product.slug });
    ensure(!anonRecord.error && anonRecord.data?.record?.document?.model3d?.mediaId === model.id &&
      anonRecord.data.record.document.model3d.posterId === poster.id, "public_product_projection_missing_model");
    const catalog = await rpc(anon, "published_list_products", {
      p_query: product.document.variants[0].sku, p_category_ids: [], p_min_price_paise: null,
      p_max_price_paise: null, p_availability: "all", p_sort: "relevance", p_limit: 48, p_offset: 0,
    });
    ensure(!catalog.error && catalog.data?.items?.some((item) => item.id === product.id && item.document?.model3d?.mediaId === model.id),
      "published_list_products_model_projection_missing");

    const publicHash = await rpc(anon, "public_get_media", { p_id: model.id });
    ensure(!publicHash.error && publicHash.data?.media?.modelSha256 === modelHash, "public_model_sha_missing");
    const publicDownload = await request(context, `/api/media/${model.id}`, null);
    ensure(publicDownload.status === 200 && publicDownload.headers.get("content-type") === "model/gltf-binary" &&
      publicDownload.headers.get("content-disposition")?.startsWith("inline;") &&
      publicDownload.headers.get("cache-control")?.includes("no-store") &&
      publicDownload.headers.get("x-content-type-options") === "nosniff", "public_model_delivery_headers_invalid");
    const publicBytes = Buffer.from(await publicDownload.arrayBuffer());
    ensure(publicBytes.equals(triangle) && createHash("sha256").update(publicBytes).digest("hex") === modelHash,
      "public_model_delivery_bytes_or_hash_invalid");

    const blockedWithdraw = await request(context, `/api/admin/media/${model.id}`, auth.staff.appToken, {
      method: "PATCH", json: {
        expectedVersion: publicModel.version, altText: model.altText, source: model.source,
        published: false, publicUseAllowed: true,
      },
    });
    ensure(blockedWithdraw.status === 409, "live_product_reference_did_not_block_model_withdrawal");

    const withdrawnProduct = await transition(context, auth, "products", published.record, "unpublish");
    state.record = withdrawnProduct.record;
    const withdrawnModel = await updateMedia(context, auth, model.id, {
      expectedVersion: publicModel.version, altText: model.altText, source: model.source,
      published: false, publicUseAllowed: true,
    });
    state.modelMedia = { ...state.modelMedia, version: withdrawnModel.version, published: false };
    ensure((await request(context, `/api/media/${model.id}`, null)).status === 404, "withdrawn_model_still_anonymous");
    ensure(categoryLive.record.publishedRevisionId, "fixture_category_not_published");
  } catch (error) {
    primaryFailure = error instanceof HarnessFailure ? error : new HarnessFailure("product_model_media_verification_failed");
  } finally {
    if (state.users.length) {
      await pendingUserCheckpoint.catch(() => undefined);
      if (keepFixtures && state.users.length === 2) {
        try {
          await checkpoint(state);
          console.log("Disposable product model media fixtures retained in .bootstrap/product-model-media-fixtures.json.");
        } catch {
          console.error("Product model media fixture checkpoint failed safely.");
          primaryFailure ??= new HarnessFailure("product_model_media_fixture_checkpoint_failed");
        }
      } else {
        try { await checkpoint(state); } catch { /* Cleanup still runs; a second checkpoint is attempted on failure. */ }
        try {
          if (state.staffUserId && auth && state.users.length === 2) await cleanup(context, state, auth);
          else await cleanFixtures(context, state.users, state.runId);
          await unlink(fixturePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
        } catch (error) {
          const label = error instanceof HarnessFailure ? error.label : "product_model_media_cleanup_failed";
          try { await checkpoint(state); } catch { /* Keep cleanup diagnostic separate from the primary failure. */ }
          console.error(`Product model media cleanup failed separately: ${label}. Fixture state is retained when checkpointing succeeds.`);
          primaryFailure ??= new HarnessFailure(label);
        }
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
    console.error(`Product model media integration stopped safely: ${error instanceof HarnessFailure ? error.label : "invalid_command_line"}.`);
    process.exitCode = 2;
    return;
  }
  let context;
  try {
    context = await preflight();
  } catch (error) {
    console.error(`Product model media preflight failed safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }
  if (args.cleanupOnly) {
    try {
      const count = await cleanupStoredFixtures(context);
      console.log(`Cleanup completed for ${count} verified disposable fixture users.`);
    } catch (error) {
      console.error(`Product model media cleanup stopped safely: ${error instanceof HarnessFailure ? error.label : "product_model_media_cleanup_failed"}.`);
      process.exitCode = 1;
    }
    return;
  }
  try {
    await run(context, args);
    console.log("Disposable product model media integration checks passed.");
  } catch (error) {
    console.error(`Product model media integration failed safely: ${error instanceof HarnessFailure ? error.label : "integration_failed"}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("product-model-media-integration.mjs")) await main();
