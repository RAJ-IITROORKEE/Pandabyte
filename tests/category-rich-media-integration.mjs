import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import {
  appRequest,
  cleanFixtures,
  createFixtures,
  ensure,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";
import { ensureOwnedCleanup, getAdminRecord } from "./phase3-publishing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap", "category-rich-media");
const tracker = path.join(work, "fixtures.json");
const mediaBucket = "editorial-media";

async function request(context, token, route, method = "GET", value) {
  const headers = new Headers();
  if (value !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", context.appOrigin);
  }
  return appRequest(context.appOrigin, route, token, {
    method,
    headers,
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}

async function response(response, status, label) {
  ensure(response.status === status, `${label}_status_${response.status}`);
  return safeJson(response, `${label}_json`);
}

async function checkpoint(state, exclusive = false) {
  await mkdir(work, { recursive: true });
  await writeFile(tracker, `${JSON.stringify(state, null, 2)}\n`, exclusive ? { flag: "wx" } : "utf8");
}

async function cleanup(context, state) {
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  if (state.users.length === 2) await ensureOwnedCleanup(context, state);
  else if (state.users.length) await cleanFixtures(context, state.users, state.runId);
  await unlink(tracker).catch((error) => { if (error.code !== "ENOENT") throw error; });
}

async function grant(context, userId, capability, runId) {
  const { error } = await context.admin.database.schema("public").rpc("set_staff_capability", {
    target_user_id: userId,
    capability_name: capability,
    enabled: true,
    reason: `category rich media fixture ${runId}`,
  });
  ensure(!error, `category_fixture_${capability.replaceAll(".", "_")}_grant_failed`);
}

async function upload(context, token, runId, name, bytes, type) {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  form.set("altText", `Disposable category media ${runId} ${name}`);
  form.set("source", "Synthetic integration fixture");
  const result = await appRequest(context.appOrigin, "/api/admin/media", token, {
    method: "POST",
    headers: { origin: context.appOrigin },
    body: form,
  });
  const body = await response(result, 201, `category_${path.extname(name).slice(1)}_upload`);
  ensure(body.media?.id && body.media.mimeType === "image/webp" && body.media.width === 24 && body.media.height === 24,
    `category_${path.extname(name).slice(1)}_media_invalid`);
  return body.media;
}

async function storageSnapshot(context) {
  const keys = new Set();
  const pageSize = 200;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total) {
    const result = await context.admin.storage.from(mediaBucket).list({ limit: pageSize, offset });
    const page = result.data?.data;
    const pagination = result.data?.pagination;
    ensure(!result.error && Array.isArray(page) && Number.isSafeInteger(pagination?.total), "category_storage_snapshot_failed");
    total = pagination.total;
    ensure(total <= 10_000, "category_storage_snapshot_too_large");
    for (const item of page) {
      ensure(item.bucket === mediaBucket && typeof item.key === "string", "category_storage_object_invalid");
      keys.add(item.key);
    }
    if (!page.length) break;
    offset += page.length;
  }
  return keys;
}

async function run() {
  const context = await preflight();
  try {
    await readFile(tracker, "utf8");
    throw Object.assign(new Error(), { label: "category_fixture_tracker_exists_use_cleanup" });
  } catch (error) {
    if (error.label) throw error;
    if (error.code !== "ENOENT") throw Object.assign(new Error(), { label: "category_fixture_tracker_unavailable" });
  }

  const state = {
    runId: randomUUID(), users: [], staffUserId: "", records: [], variants: [], media: [], storageKeys: [], inquiries: [],
  };
  let failure;
  try {
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    state.users = fixtures.users;
    const staff = fixtures.auth.staff;
    state.staffUserId = state.users.find(({ role }) => role === "staff").userId;
    await checkpoint(state, true);

    await grant(context, state.staffUserId, "catalog.edit", state.runId);
    await grant(context, state.staffUserId, "media.manage", state.runId);

    const png = await sharp({
      create: { width: 24, height: 24, channels: 4, background: { r: 38, g: 120, b: 90, alpha: 1 } },
    }).png().toBuffer();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#ff0000"/></svg>';
    const pngMedia = await upload(context, staff.appToken, state.runId, "category.png", png, "image/png");
    state.media.push({ id: pngMedia.id, key: `assets/${pngMedia.id}.webp` });
    await checkpoint(state);
    const svgMedia = await upload(context, staff.appToken, state.runId, "category.svg", Buffer.from(svg), "image/svg+xml");
    state.media.push({ id: svgMedia.id, key: `assets/${svgMedia.id}.webp` });
    await checkpoint(state);

    const badSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><script>alert(1)</script></svg>';
    const beforeRejectedUpload = await storageSnapshot(context);
    const invalidForm = new FormData();
    invalidForm.set("file", new File([badSvg], "invalid.svg", { type: "image/svg+xml" }));
    invalidForm.set("altText", `Rejected category SVG ${state.runId}`);
    invalidForm.set("source", "Synthetic rejection fixture");
    const invalidResponse = await appRequest(context.appOrigin, "/api/admin/media", staff.appToken, {
      method: "POST", headers: { origin: context.appOrigin }, body: invalidForm,
    });
    ensure(invalidResponse.status === 400, "invalid_category_svg_accepted");
    await invalidResponse.arrayBuffer();
    const afterRejectedUpload = await storageSnapshot(context);
    ensure(beforeRejectedUpload.size === afterRejectedUpload.size && [...afterRejectedUpload].every((key) => beforeRejectedUpload.has(key)),
      "invalid_category_svg_wrote_storage");

    const base = {
      title: `Phase3 ${state.runId} Rich Media Category`,
      slug: `p3-${state.runId.slice(0, 8)}-rich-media-category`,
      summary: `Disposable category rich media fixture ${state.runId}.`,
      blocks: [], seoTitle: "", seoDescription: "", parentId: null, position: 0, mediaIds: [],
    };
    const created = await response(await request(context, staff.appToken, "/api/admin/categories", "POST", { document: base }), 201, "category_create");
    const record = created.record;
    ensure(record?.id && record.kind === "category", "category_create_response_invalid");
    state.records.push({ id: record.id, module: "categories", kind: "category", slug: record.slug });
    await checkpoint(state);

    const richContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `Rich description ${state.runId}` }] },
        { type: "image", attrs: { mediaId: pngMedia.id, alt: "Disposable PNG image" } },
        { type: "image", attrs: { mediaId: svgMedia.id, alt: "Disposable SVG image" } },
      ],
    };
    const document = { ...base, mediaIds: [pngMedia.id, svgMedia.id], richContent };
    const saved = await response(await request(context, staff.appToken, `/api/admin/categories/${record.id}`, "PATCH", {
      expectedVersion: record.version,
      document,
    }), 200, "category_rich_content_save");
    ensure(saved.record.version > record.version, "category_rich_content_version_not_incremented");
    ensure(isDeepStrictEqual(saved.record.document.richContent, richContent), "category_rich_content_save_mismatch");
    const reloaded = await getAdminRecord(context, fixtures.auth, "categories", record.id, "category_rich_content_reload_failed");
    ensure(isDeepStrictEqual(reloaded.document.richContent, richContent) &&
      reloaded.document.mediaIds.includes(pngMedia.id) && reloaded.document.mediaIds.includes(svgMedia.id),
    "category_rich_content_reload_mismatch");
    console.log("Category draft richContent round-trip, PNG/SVG media upload, invalid SVG rejection, and owned cleanup checks passed.");
  } catch (error) {
    failure = error;
  } finally {
    if (state.users.length) {
      try {
        await cleanup(context, state);
        console.log("All verified disposable category and media fixtures were removed.");
      } catch (error) {
        try { await checkpoint(state); } catch { /* Keep the original failure label. */ }
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
}

async function cleanupStored() {
  const context = await preflight();
  const state = JSON.parse(await readFile(tracker, "utf8"));
  ensure(/^[0-9a-f-]{36}$/i.test(state.runId) && state.users?.length === 2 && Array.isArray(state.records) && Array.isArray(state.media),
    "category_fixture_tracker_invalid");
  await cleanup(context, state);
  console.log("Owned disposable category and media fixtures were removed.");
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--cleanup")) {
  console.error("Category rich media integration stopped safely: invalid_arguments.");
  process.exitCode = 2;
} else {
  try {
    if (args[0] === "--cleanup") await cleanupStored();
    else await run();
  } catch (error) {
    const label = /^[a-z0-9_]{1,180}$/.test(error?.label ?? "") ? error.label : "category_rich_media_integration_failed";
    console.error(`Category rich media integration stopped safely: ${label}.`);
    process.exitCode = 1;
  }
}
