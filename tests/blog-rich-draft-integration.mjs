import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  appRequest,
  cleanFixtures,
  createFixtures,
  ensure,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap", "blog-rich-draft");
const tracker = path.join(work, "fixtures.json");
const tableRoute = "/api/admin/blog";
const fixtureTitle = (runId, index) => `Blog rich draft fixture ${runId} Draft ${String(index).padStart(2, "0")}`;
const fixtureSlug = (runId, index) => `blog-rich-draft-${runId.slice(0, 8)}-${String(index).padStart(2, "0")}`;
const fixtureAuthor = (runId) => `Blog rich draft fixture ${runId}`;

function label(error) {
  return /^[a-z0-9_]{1,180}$/.test(error?.label ?? "") ? error.label : "blog_rich_draft_integration_failed";
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

async function request(context, token, route) {
  return appRequest(context.appOrigin, route, token);
}

async function requestJson(context, token, route, method, value) {
  const headers = new Headers({ "content-type": "application/json", origin: context.appOrigin });
  return appRequest(context.appOrigin, route, token, { method, headers, body: JSON.stringify(value) });
}

async function read(response, status, code) {
  ensure(response.status === status, `${code}_status_${response.status}`);
  return safeJson(response, `${code}_json`);
}

async function checkpoint(state) {
  await mkdir(work, { recursive: true });
  await writeFile(tracker, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function blogDocument(runId, index) {
  const title = fixtureTitle(runId, index);
  return {
    title,
    slug: fixtureSlug(runId, index),
    summary: `Unpublished Blog rich draft fixture ${runId}.`,
    blocks: [{ type: "paragraph", text: `Private draft fixture ${runId}, row ${index}.` }],
    seoTitle: title,
    seoDescription: `Disposable unpublished test content ${runId}.`,
    author: fixtureAuthor(runId),
    tags: [`test-${runId.slice(0, 8)}`],
    mediaIds: [],
  };
}

function validateCleanupState(state) {
  ensure(state && /^[0-9a-f-]{36}$/i.test(state.runId) && Array.isArray(state.users) && state.users.length <= 2 &&
    Array.isArray(state.records) && state.users.every((user) => user.runId === state.runId), "blog_rich_draft_fixture_journal_invalid");
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(roles.size === state.users.length && [...roles].every((role) => ["customer", "staff"].includes(role)), "blog_rich_draft_fixture_users_invalid");
  const indexes = new Set();
  for (const record of state.records) {
    ensure(record && Object.keys(record).length === 5 && Object.hasOwn(record, "id") && Object.hasOwn(record, "index") &&
      Object.hasOwn(record, "title") && Object.hasOwn(record, "slug") && Object.hasOwn(record, "author") &&
      /^[0-9a-f-]{36}$/i.test(record.id) && Number.isInteger(record.index) && record.index >= 0 && record.index < 11 &&
      record.title === fixtureTitle(state.runId, record.index) && record.slug === fixtureSlug(state.runId, record.index) &&
      record.author === fixtureAuthor(state.runId) && !indexes.has(record.index), "blog_rich_draft_fixture_record_invalid");
    indexes.add(record.index);
  }
  state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
  ensure(state.staffUserId || state.records.length === 0, "blog_rich_draft_cleanup_staff_missing");
}

function validateJournal(state) {
  validateCleanupState(state);
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(state.users.length === 2 && roles.size === 2 && roles.has("customer") && roles.has("staff"), "blog_rich_draft_fixture_users_invalid");
}

async function cleanupBlogs(context, state) {
  const ids = (state.records ?? []).map(({ id }) => id);
  const staffId = state.staffUserId;
  if (!staffId) {
    ensure(ids.length === 0, "blog_rich_draft_cleanup_staff_missing");
    return;
  }
  ensure(new Set(ids).size === ids.length, "blog_rich_draft_cleanup_journal_duplicate_ids");

  const owned = await table(context.admin, "cms_records")
    .select("id,kind,slug,draft,created_by,published_revision_id,archived_at")
    .eq("created_by", staffId)
    .limit(1000);
  ensure(!owned.error, "blog_rich_draft_cleanup_discovery_failed");
  const titlePrefix = `Blog rich draft fixture ${state.runId} Draft `;
  const slugPrefix = `blog-rich-draft-${state.runId.slice(0, 8)}-`;
  const author = fixtureAuthor(state.runId);
  const ownedById = new Map((owned.data ?? []).map((row) => [row.id, row]));
  const trackedRows = ids.length
    ? await table(context.admin, "cms_records").select("id,kind,slug,draft,created_by,published_revision_id,archived_at").in("id", ids).limit(100)
    : { data: [], error: null };
  ensure(!trackedRows.error, "blog_rich_draft_cleanup_tracked_read_failed");
  const trackedById = new Map((trackedRows.data ?? []).map((row) => [row.id, row]));
  const byId = new Map();
  for (const row of owned.data ?? []) {
    if (row.kind === "blog" && row.draft?.title?.startsWith(titlePrefix) && row.slug?.startsWith(slugPrefix) && row.draft?.author === author) {
      byId.set(row.id, row);
    }
  }

  const tracked = new Map((state.records ?? []).map((record) => [record.id, record]));
  for (const [id, expected] of tracked) {
    const row = trackedById.get(id);
    if (!row) continue;
    ensure(row.created_by === staffId && row.kind === "blog" && row.draft?.title === expected.title && row.slug === expected.slug &&
      row.draft?.author === expected.author, "blog_rich_draft_cleanup_fixture_mismatch");
    ensure(ownedById.has(id), "blog_rich_draft_cleanup_creator_mismatch");
    byId.set(id, row);
  }
  for (const [id, row] of byId) {
    ensure(row.created_by === staffId && row.kind === "blog" && row.draft?.title?.startsWith(titlePrefix) &&
      row.slug?.startsWith(slugPrefix) && row.draft?.author === author, "blog_rich_draft_cleanup_discovered_fixture_mismatch");
    ids.push(id);
  }

  const fixtureIds = [...new Set(ids)];
  if (!fixtureIds.length) return;
  for (const id of fixtureIds) {
    const row = byId.get(id);
    ensure(row && row.created_by === staffId && row.kind === "blog" && row.draft?.title?.startsWith(titlePrefix) &&
      row.slug?.startsWith(slugPrefix) && row.draft?.author === author && row.published_revision_id === null && row.archived_at === null,
    "blog_rich_draft_cleanup_not_unpublished_draft");
  }
  for (const name of ["cms_revisions", "cms_live_routes", "cms_slug_redirects"]) {
    const references = await table(context.admin, name).select("record_id").in("record_id", fixtureIds).limit(100);
    ensure(!references.error && (references.data ?? []).length === 0, "blog_rich_draft_cleanup_public_history_found");
  }

  const removed = await table(context.admin, "cms_records").delete().in("id", fixtureIds)
    .eq("kind", "blog").eq("created_by", staffId).is("published_revision_id", null).is("archived_at", null).select("id");
  ensure(!removed.error, "blog_rich_draft_cleanup_delete_failed");
  const remaining = await table(context.admin, "cms_records").select("id").in("id", fixtureIds).limit(100);
  ensure(!remaining.error && (remaining.data ?? []).length === 0, "blog_rich_draft_cleanup_records_remain");
}

async function cleanup(context, state) {
  validateCleanupState(state);
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  await cleanupBlogs(context, state);
  await cleanFixtures(context, state.users, state.runId);
  await unlink(tracker).catch((error) => { if (error.code !== "ENOENT") throw error; });
}

async function verify(context, state, fixtures) {
  const staff = fixtures.auth.staff;
  const grant = await rpc(context.admin, "set_staff_capability", {
    target_user_id: state.staffUserId,
    capability_name: "content.edit",
    enabled: true,
    reason: `Blog rich draft fixture ${state.runId}`,
  });
  ensure(!grant.error, "blog_rich_draft_fixture_grant_failed");

  const legacy = blogDocument(state.runId, 0);
  const created = await read(await requestJson(context, staff.appToken, "/api/admin/blog", "POST", { document: legacy }), 201, "blog_rich_draft_create");
  const record = created.record;
  ensure(record?.id && record.kind === "blog" && record.version === 1 && record.publishedRevisionId === null && !record.archived &&
    record.title === legacy.title && record.slug === legacy.slug && record.document?.author === legacy.author, "blog_rich_draft_create_invalid");
  state.records.push({ id: record.id, index: 0, title: record.title, slug: record.slug, author: record.document.author });
  await checkpoint(state);

  const route = `/api/admin/blog/${record.id}`;
  const legacyRead = await read(await request(context, staff.appToken, route), 200, "blog_legacy_draft_read");
  ensure(isDeepStrictEqual(legacyRead.record?.document?.blocks, legacy.blocks) &&
    legacyRead.record?.document?.richContent === undefined, "blog_legacy_draft_mismatch");
  ensure((await request(context, null, `/api/published/blog/${record.slug}`)).status === 404, "blog_rich_draft_publicly_visible");

  const richContent = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Draft heading" }] },
    { type: "paragraph", content: [{ type: "text", text: `Formatted draft ${state.runId}`, marks: [{ type: "bold" }] }] },
  ] };
  const document = { ...legacy, blocks: [], richContent };
  const saved = await read(await requestJson(context, staff.appToken, route, "PATCH", { expectedVersion: record.version, document }), 200, "blog_rich_draft_save");
  ensure(saved.record?.version === record.version + 1 && saved.record.publishedRevisionId === null &&
    isDeepStrictEqual(saved.record.document?.richContent, richContent), "blog_rich_draft_save_mismatch");
  const reloaded = await read(await request(context, staff.appToken, route), 200, "blog_rich_draft_reload");
  ensure(reloaded.record?.version === saved.record.version && isDeepStrictEqual(reloaded.record.document?.richContent, richContent) &&
    Array.isArray(reloaded.record.document.blocks) && reloaded.record.document.blocks.length === 0, "blog_rich_draft_reload_mismatch");
  ensure((await requestJson(context, staff.appToken, route, "PATCH", { expectedVersion: record.version, document })).status === 409,
    "blog_rich_draft_stale_write_allowed");
  const invalid = { ...document, richContent: { type: "doc", content: [{ type: "script" }] } };
  ensure((await requestJson(context, staff.appToken, route, "PATCH", { expectedVersion: saved.record.version, document: invalid })).status === 400,
    "blog_rich_draft_invalid_content_allowed");
  const unchanged = await read(await request(context, staff.appToken, route), 200, "blog_rich_draft_unchanged");
  ensure(unchanged.record?.version === saved.record.version && isDeepStrictEqual(unchanged.record.document?.richContent, richContent),
    "blog_rich_draft_changed_after_rejection");
  ensure((await request(context, null, `/api/published/blog/${record.slug}`)).status === 404, "blog_rich_draft_publicly_visible_after_save");
}

async function main() {
  const args = process.argv.slice(2);
  ensure(args.length <= 1 && (!args.length || args[0] === "--cleanup"), "blog_rich_draft_invalid_arguments");
  process.env.PHASE2_APP_BASE_URL ??= "http://localhost:3020";
  const context = await preflight();
  if (args[0] === "--cleanup") {
    let state;
    try { state = JSON.parse(await readFile(tracker, "utf8")); } catch { ensure(false, "blog_rich_draft_fixture_journal_unavailable"); }
    validateJournal(state);
    await cleanup(context, state);
    console.log("Owned unpublished Blog fixtures, temporary grants, and disposable identities cleaned.");
    return;
  }

  try { await readFile(tracker, "utf8"); throw { label: "blog_rich_draft_fixture_journal_exists_use_cleanup" }; }
  catch (error) { if (error?.label) throw error; if (error?.code !== "ENOENT") throw { label: "blog_rich_draft_fixture_journal_unavailable" }; }

  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [] };
  let failure;
  try {
    const ready = await request(context, null, tableRoute);
    ensure(ready.status === 401, "blog_rich_draft_local_app_not_ready");
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
    await checkpoint(state);
    await verify(context, state, fixtures);
    console.log("Blog rich and legacy draft read/write, version guards, invalid content, and privacy passed without publication.");
  } catch (error) {
    failure = error;
  } finally {
    if (state.users.length) {
      try { await cleanup(context, state); }
      catch (error) {
        try { await checkpoint(state); } catch { /* Retain the original cleanup failure. */ }
        failure ??= error;
      }
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Blog table integration stopped safely: ${label(error)}.`);
    process.exitCode = 1;
  });
}
