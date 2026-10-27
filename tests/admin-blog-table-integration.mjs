import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
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
const work = path.join(root, ".bootstrap", "admin-blog-table");
const tracker = path.join(work, "fixtures.json");
const tableRoute = "/api/admin/blog/table";
const fixtureTitle = (runId, index) => `Blog table fixture ${runId} Draft ${String(index).padStart(2, "0")}`;
const fixtureSlug = (runId, index) => `blog-table-${runId.slice(0, 8)}-${String(index).padStart(2, "0")}`;
const fixtureAuthor = (runId) => `Blog table fixture ${runId}`;

function label(error) {
  return /^[a-z0-9_]{1,180}$/.test(error?.label ?? "") ? error.label : "blog_table_integration_failed";
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
    summary: `Unpublished Blog table fixture ${runId}.`,
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
    Array.isArray(state.records) && state.users.every((user) => user.runId === state.runId), "blog_table_fixture_journal_invalid");
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(roles.size === state.users.length && [...roles].every((role) => ["customer", "staff"].includes(role)), "blog_table_fixture_users_invalid");
  const indexes = new Set();
  for (const record of state.records) {
    ensure(record && Object.keys(record).length === 5 && Object.hasOwn(record, "id") && Object.hasOwn(record, "index") &&
      Object.hasOwn(record, "title") && Object.hasOwn(record, "slug") && Object.hasOwn(record, "author") &&
      /^[0-9a-f-]{36}$/i.test(record.id) && Number.isInteger(record.index) && record.index >= 0 && record.index < 11 &&
      record.title === fixtureTitle(state.runId, record.index) && record.slug === fixtureSlug(state.runId, record.index) &&
      record.author === fixtureAuthor(state.runId) && !indexes.has(record.index), "blog_table_fixture_record_invalid");
    indexes.add(record.index);
  }
  state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
  ensure(state.staffUserId || state.records.length === 0, "blog_table_cleanup_staff_missing");
}

function validateJournal(state) {
  validateCleanupState(state);
  const roles = new Set(state.users.map(({ role }) => role));
  ensure(state.users.length === 2 && roles.size === 2 && roles.has("customer") && roles.has("staff"), "blog_table_fixture_users_invalid");
}

async function cleanupBlogs(context, state) {
  const ids = (state.records ?? []).map(({ id }) => id);
  const staffId = state.staffUserId;
  if (!staffId) {
    ensure(ids.length === 0, "blog_table_cleanup_staff_missing");
    return;
  }
  ensure(new Set(ids).size === ids.length, "blog_table_cleanup_journal_duplicate_ids");

  const owned = await table(context.admin, "cms_records")
    .select("id,kind,slug,draft,created_by,published_revision_id,archived_at")
    .eq("created_by", staffId)
    .limit(1000);
  ensure(!owned.error, "blog_table_cleanup_discovery_failed");
  const titlePrefix = `Blog table fixture ${state.runId} Draft `;
  const slugPrefix = `blog-table-${state.runId.slice(0, 8)}-`;
  const author = fixtureAuthor(state.runId);
  const ownedById = new Map((owned.data ?? []).map((row) => [row.id, row]));
  const trackedRows = ids.length
    ? await table(context.admin, "cms_records").select("id,kind,slug,draft,created_by,published_revision_id,archived_at").in("id", ids).limit(100)
    : { data: [], error: null };
  ensure(!trackedRows.error, "blog_table_cleanup_tracked_read_failed");
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
      row.draft?.author === expected.author, "blog_table_cleanup_fixture_mismatch");
    ensure(ownedById.has(id), "blog_table_cleanup_creator_mismatch");
    byId.set(id, row);
  }
  for (const [id, row] of byId) {
    ensure(row.created_by === staffId && row.kind === "blog" && row.draft?.title?.startsWith(titlePrefix) &&
      row.slug?.startsWith(slugPrefix) && row.draft?.author === author, "blog_table_cleanup_discovered_fixture_mismatch");
    ids.push(id);
  }

  const fixtureIds = [...new Set(ids)];
  if (!fixtureIds.length) return;
  for (const id of fixtureIds) {
    const row = byId.get(id);
    ensure(row && row.created_by === staffId && row.kind === "blog" && row.draft?.title?.startsWith(titlePrefix) &&
      row.slug?.startsWith(slugPrefix) && row.draft?.author === author && row.published_revision_id === null && row.archived_at === null,
    "blog_table_cleanup_not_unpublished_draft");
  }
  for (const name of ["cms_revisions", "cms_live_routes", "cms_slug_redirects"]) {
    const references = await table(context.admin, name).select("record_id").in("record_id", fixtureIds).limit(100);
    ensure(!references.error && (references.data ?? []).length === 0, "blog_table_cleanup_public_history_found");
  }

  const removed = await table(context.admin, "cms_records").delete().in("id", fixtureIds)
    .eq("kind", "blog").eq("created_by", staffId).is("published_revision_id", null).is("archived_at", null).select("id");
  ensure(!removed.error, "blog_table_cleanup_delete_failed");
  const remaining = await table(context.admin, "cms_records").select("id").in("id", fixtureIds).limit(100);
  ensure(!remaining.error && (remaining.data ?? []).length === 0, "blog_table_cleanup_records_remain");
}

async function cleanup(context, state) {
  validateCleanupState(state);
  for (const fixture of state.users) await verifyFixtureOwnership(context.clerk, fixture);
  await cleanupBlogs(context, state);
  await cleanFixtures(context, state.users, state.runId);
  await unlink(tracker).catch((error) => { if (error.code !== "ENOENT") throw error; });
}

async function list(context, token, params, code) {
  const query = new URLSearchParams(params);
  const response = await request(context, token, `${tableRoute}?${query}`);
  const result = await read(response, 200, code);
  ensure(response.headers.get("cache-control")?.includes("private") && response.headers.get("cache-control")?.includes("no-store"), "blog_table_response_cached");
  ensure(Array.isArray(result.items) && Number.isSafeInteger(result.total), `${code}_shape_invalid`);
  return result;
}

function assertGenericBlogItem(item, expected) {
  const keys = ["id", "kind", "title", "slug", "version", "publishedRevisionId", "archived", "updatedAt"];
  ensure(item && Object.keys(item).length === keys.length && keys.every((key) => Object.hasOwn(item, key)), "blog_table_dto_shape_invalid");
  ensure(item.id === expected.id && item.kind === "blog" && item.title === expected.title && item.slug === expected.slug &&
    item.version === expected.version && item.publishedRevisionId === null && item.archived === false &&
    typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)), "blog_table_dto_value_invalid");
}

async function verify(context, state, fixtures) {
  const staff = fixtures.auth.staff;
  const customer = fixtures.auth.customer;

  ensure((await request(context, null, tableRoute)).status === 401, "blog_table_anonymous_allowed");
  ensure((await request(context, customer.appToken, tableRoute)).status === 403, "blog_table_customer_allowed");
  ensure((await request(context, staff.appToken, tableRoute)).status === 403, "blog_table_ungranted_staff_allowed");
  const customerRpc = await rpc(customer.database, "admin_list_blog_table", {
    p_query: "", p_status: "all", p_sort: "updated_desc", p_limit: 10, p_offset: 0,
  });
  ensure(customerRpc.error?.code === "P0001" && customerRpc.error.details === "forbidden", "blog_table_customer_rpc_allowed");

  const grant = await rpc(context.admin, "set_staff_capability", {
    target_user_id: state.staffUserId,
    capability_name: "content.edit",
    enabled: true,
    reason: `Blog table fixture ${state.runId}`,
  });
  ensure(!grant.error, "blog_table_fixture_grant_failed");

  const records = [];
  for (let index = 0; index < 11; index += 1) {
    const document = blogDocument(state.runId, index);
    const created = await read(await requestJson(context, staff.appToken, "/api/admin/blog", "POST", { document }), 201, "blog_table_draft_create");
    const record = created.record;
    ensure(record?.id && record.kind === "blog" && record.title === document.title && record.slug === document.slug &&
      record.version === 1 && record.publishedRevisionId === null && record.archived === false && record.document?.author === document.author &&
      record.document?.tags?.[0] === document.tags[0], "blog_table_draft_response_invalid");
    state.records.push({ id: record.id, index, title: record.title, slug: record.slug, author: record.document.author });
    records.push(record);
    await checkpoint(state);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  ensure(new Set(records.map((record) => Date.parse(record.updatedAt))).size === records.length, "blog_table_fixture_timestamps_not_distinct");

  const detail = await read(await request(context, staff.appToken, `/api/admin/blog/${records[0].id}`), 200, "blog_editor_draft_read");
  ensure(detail.record?.document?.title === records[0].title && detail.record.document.slug === records[0].slug &&
    detail.record.document.author === fixtureAuthor(state.runId) && detail.record.document.tags?.[0] === blogDocument(state.runId, 0).tags[0] &&
    detail.record.document.blocks[0]?.text.includes(state.runId), "blog_editor_draft_document_invalid");
  ensure((await request(context, null, `/api/published/blog/${records[0].slug}`)).status === 404, "blog_table_draft_publicly_visible");
  const publicList = await read(await request(context, null, `/api/published/blog?q=${encodeURIComponent(state.runId)}&limit=100`), 200, "blog_table_public_list");
  ensure(Array.isArray(publicList.items) && !publicList.items.some((item) => item.slug.startsWith(`blog-table-${state.runId.slice(0, 8)}-`)),
    "blog_table_draft_in_public_list");

  const all = await list(context, staff.appToken, { q: state.runId, status: "all", sort: "title_asc", limit: "20", offset: "0" }, "blog_table_all");
  ensure(all.total === 11 && all.items.length === 11, "blog_table_search_or_all_status_invalid");
  for (let index = 0; index < 11; index += 1) assertGenericBlogItem(all.items[index], records[index]);
  ensure(all.items.every((item) => item.kind === "blog"), "blog_table_kind_filter_invalid");
  const unique = await list(context, staff.appToken, { q: `${state.runId} Draft 05` }, "blog_table_search_one");
  ensure(unique.total === 1 && unique.items[0].id === records[5].id, "blog_table_search_invalid");
  const drafts = await list(context, staff.appToken, { q: state.runId, status: "draft", limit: "10", offset: "0" }, "blog_table_drafts");
  ensure(drafts.total === 11 && drafts.items.length === 10, "blog_table_draft_filter_invalid");
  const published = await list(context, staff.appToken, { q: state.runId, status: "published" }, "blog_table_published_empty");
  const archived = await list(context, staff.appToken, { q: state.runId, status: "archived" }, "blog_table_archived_empty");
  ensure(published.total === 0 && published.items.length === 0 && archived.total === 0 && archived.items.length === 0,
    "blog_table_non_draft_status_filter_invalid");

  const base = { q: state.runId, status: "draft", limit: "10" };
  const ascending = await list(context, staff.appToken, { ...base, sort: "title_asc", offset: "0" }, "blog_table_title_asc");
  const descending = await list(context, staff.appToken, { ...base, sort: "title_desc", offset: "0" }, "blog_table_title_desc");
  ensure(ascending.items.map((item) => item.id).join() === records.slice(0, 10).map((record) => record.id).join() &&
    descending.items.map((item) => item.id).join() === records.slice().reverse().slice(0, 10).map((record) => record.id).join(),
  "blog_table_title_sort_invalid");

  const updatedAsc = await list(context, staff.appToken, { ...base, sort: "updated_asc", offset: "0" }, "blog_table_updated_asc");
  const updatedDesc = await list(context, staff.appToken, { ...base, sort: "updated_desc", offset: "0" }, "blog_table_updated_desc");
  ensure(updatedAsc.items.map((item) => item.id).join() === records.slice(0, 10).map((record) => record.id).join() &&
    updatedDesc.items.map((item) => item.id).join() === records.slice().reverse().slice(0, 10).map((record) => record.id).join(),
  "blog_table_updated_sort_invalid");

  const second = await list(context, staff.appToken, { ...base, sort: "title_asc", offset: "10" }, "blog_table_second_page");
  ensure(second.total === 11 && second.items.length === 1 && second.items[0].id === records[10].id, "blog_table_pagination_invalid");
  for (const query of ["sort=unknown", "q=x&q=y", "limit=1", "offset=10001", "status=unknown", "debug=1"]) {
    ensure((await request(context, staff.appToken, `${tableRoute}?${query}`)).status === 400, "blog_table_invalid_query_allowed");
  }
}

async function main() {
  const args = process.argv.slice(2);
  ensure(args.length <= 1 && (!args.length || args[0] === "--cleanup"), "blog_table_invalid_arguments");
  process.env.PHASE2_APP_BASE_URL ??= "http://localhost:3020";
  const context = await preflight();
  if (args[0] === "--cleanup") {
    let state;
    try { state = JSON.parse(await readFile(tracker, "utf8")); } catch { ensure(false, "blog_table_fixture_journal_unavailable"); }
    validateJournal(state);
    await cleanup(context, state);
    console.log("Owned unpublished Blog fixtures, temporary grants, and disposable identities cleaned.");
    return;
  }

  try { await readFile(tracker, "utf8"); throw { label: "blog_table_fixture_journal_exists_use_cleanup" }; }
  catch (error) { if (error?.label) throw error; if (error?.code !== "ENOENT") throw { label: "blog_table_fixture_journal_unavailable" }; }

  const state = { runId: randomUUID(), users: [], staffUserId: "", records: [] };
  let failure;
  try {
    const ready = await request(context, null, tableRoute);
    ensure(ready.status === 401, "blog_table_local_app_not_ready");
    const fixtures = await createFixtures(context.clerk, state.runId, (fixture) => state.users.push(fixture));
    state.users = fixtures.users;
    state.staffUserId = state.users.find(({ role }) => role === "staff")?.userId ?? "";
    await checkpoint(state);
    await verify(context, state, fixtures);
    console.log("Blog table API filters, sorts, 10+1 pagination, draft privacy, editor compatibility, and access boundaries passed without publication.");
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
