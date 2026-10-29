import { readFile } from "node:fs/promises";
import { preflight, ensure } from "./phase2-isolation.mjs";

// Run only after the fixture has been unpublished and its public route withdrawn.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const table = (client, name) => client.database.schema("public").from(name);
const exact = (result, label) => { ensure(!result.error && Array.isArray(result.data), label); return result.data; };
const contains = (node, value) => typeof node === "string" ? node.includes(value) : node && typeof node === "object" && Object.values(node).some((v) => contains(v, value));
const sameIds = (rows, ids) => rows.length === ids.length && rows.every((row) => ids.includes(row.id));

async function main() {
  ensure(process.argv.length === 3 && process.argv[2] === "--cleanup", "explicit_cleanup_required");
  const f = JSON.parse(await readFile(process.env.BLOG_FIXTURE_MANIFEST, "utf8"));
  ensure(/^[0-9a-f]{6}$/.test(f.marker) && uuid.test(f.blogId) && uuid.test(f.mediaId) && f.blogId !== f.mediaId &&
    /^user_[A-Za-z0-9_-]{1,96}$/.test(f.ownerId) && Number.isSafeInteger(f.blogVersion) && f.blogVersion > 0 &&
    Number.isSafeInteger(f.mediaVersion) && f.mediaVersion > 0 && typeof f.mediaPublished === "boolean" &&
    f.title === `Disposable blog cover test ${f.marker}` && f.slug === `disposable-blog-cover-test-${f.marker}` &&
    f.author === `Disposable test ${f.marker}` && f.filename === "blog-e2e-20261028-cover.webp" &&
    f.alt === `Disposable cover test ${f.marker}` && Array.isArray(f.revisions) && Array.isArray(f.events) &&
    f.revisions.length <= 20 && f.events.length <= 20 &&
    f.revisions.every((r) => uuid.test(r.id) && Number.isSafeInteger(r.sourceVersion) && r.sourceVersion > 0) &&
    f.events.every((e) => Number.isSafeInteger(e.id) && e.id > 0 && Number.isSafeInteger(e.version) && e.version > 0 &&
      ["upload", "update", "archive"].includes(e.action)) &&
    new Set(f.revisions.map((r) => r.id)).size === f.revisions.length &&
    new Set(f.events.map((e) => e.id)).size === f.events.length, "manifest_invalid");
  const { admin } = await preflight();
  const one = async (name, fields, id) => { const rows = exact(await table(admin, name).select(fields).eq("id", id).limit(2), `${name}_read_failed`); ensure(rows.length === 1, `${name}_missing`); return rows[0]; };
  const record = await one("cms_records", "id,kind,title,slug,draft,version,created_by,updated_by,published_revision_id,draft_source_revision_id,archived_at", f.blogId);
  ensure(record.kind === "blog" && record.title === f.title && record.slug === f.slug && record.draft?.title === f.title &&
    record.draft?.slug === f.slug && record.draft?.author === f.author && record.created_by === f.ownerId &&
    record.updated_by === f.ownerId && record.version === f.blogVersion && record.published_revision_id === null && record.archived_at === null,
    "blog_scope_mismatch");
  const revisions = exact(await table(admin, "cms_revisions").select("id,record_id,source_version,source_revision_id,title,slug,document,published_by").eq("record_id", f.blogId).limit(21), "revisions_read_failed");
  ensure(sameIds(revisions, f.revisions.map((r) => r.id)) && revisions.every((r) => r.record_id === f.blogId &&
    r.published_by === f.ownerId && r.title === f.title && r.slug === f.slug && r.document?.title === f.title &&
    r.document?.slug === f.slug && r.document?.author === f.author &&
    f.revisions.some((v) => v.id === r.id && v.sourceVersion === r.source_version) &&
    (r.source_revision_id === null || f.revisions.some((v) => v.id === r.source_revision_id))) &&
    (record.draft_source_revision_id === null || f.revisions.some((v) => v.id === record.draft_source_revision_id)), "revision_scope_mismatch");
  for (const name of ["cms_live_routes", "cms_slug_redirects"]) {
    ensure(exact(await table(admin, name).select("record_id").eq("record_id", f.blogId).limit(1), `${name}_read_failed`).length === 0, `${name}_still_present`);
  }
  const media = await one("cms_media", "id,object_key,filename,alt_text,mime_type,created_by,version,published,archived", f.mediaId);
  const key = `assets/${f.mediaId}.webp`;
  ensure(media.object_key === key && media.filename === f.filename && media.alt_text === f.alt && media.mime_type === "image/webp" &&
    media.created_by === f.ownerId && media.version === f.mediaVersion && media.published === f.mediaPublished && !media.archived, "media_scope_mismatch");
  for (const [field, value] of [["filename", f.filename], ["alt_text", f.alt]]) {
    const rows = exact(await table(admin, "cms_media").select("id").eq(field, value).limit(2), "media_uniqueness_read_failed");
    ensure(rows.length === 1 && rows[0].id === f.mediaId, "media_marker_not_unique");
  }
  const events = exact(await table(admin, "editorial_media_events").select("id,media_id,actor,action,version").eq("media_id", f.mediaId).limit(21), "events_read_failed");
  ensure(sameIds(events, f.events.map((e) => e.id)) && events.every((e) => e.media_id === f.mediaId && e.actor === f.ownerId &&
    f.events.some((v) => v.id === e.id && v.action === e.action && v.version === e.version)), "events_scope_mismatch");
  const listed = await admin.storage.from("editorial-media").list({ prefix: key, limit: 10 });
  ensure(!listed.error && Array.isArray(listed.data?.data) && listed.data.data.filter((o) => o.key === key && o.bucket === "editorial-media" && o.uploaded_by === f.ownerId).length === 1 &&
    listed.data.data.filter((o) => o.key === key).length === 1, "storage_scope_mismatch");
  // Bounded full scans fail closed if too many rows; no other document may mention the fixture media ID.
  for (const [name, column] of [["cms_records", "draft"], ["cms_revisions", "document"]]) {
    const rows = exact(await table(admin, name).select(`id,${name === "cms_revisions" ? "record_id," : ""}${column}`).limit(10000), `${name}_reference_scan_failed`);
    ensure(rows.length < 10000 && rows.every((row) => (name === "cms_records" ? row.id === f.blogId : row.record_id === f.blogId) || !contains(row[column], f.mediaId)), "other_media_reference_found");
  }
  const change = async (query, label, expected) => { const rows = exact(await query.select("id"), label); ensure(rows.length === expected, label); };
  if (record.draft_source_revision_id !== null) await change(table(admin, "cms_records").update({ draft_source_revision_id: null }).eq("id", f.blogId).eq("version", f.blogVersion).eq("created_by", f.ownerId), "record_pointer_clear_failed", 1);
  for (const revision of revisions.filter((r) => r.source_revision_id !== null)) await change(table(admin, "cms_revisions").update({ source_revision_id: null }).eq("id", revision.id).eq("record_id", f.blogId).eq("source_revision_id", revision.source_revision_id), "revision_pointer_clear_failed", 1);
  if (revisions.length) await change(table(admin, "cms_revisions").delete().in("id", f.revisions.map((r) => r.id)).eq("record_id", f.blogId), "revision_delete_failed", revisions.length);
  await change(table(admin, "cms_records").delete().eq("id", f.blogId).eq("kind", "blog").eq("created_by", f.ownerId).eq("version", f.blogVersion).is("published_revision_id", null), "record_delete_failed", 1);
  const referenced = await admin.database.schema("public").rpc("media_referenced", { p_id: f.mediaId, p_live_only: false });
  ensure(!referenced.error && referenced.data === false, "media_still_referenced");
  if (events.length) await change(table(admin, "editorial_media_events").delete().in("id", f.events.map((e) => e.id)).eq("media_id", f.mediaId).eq("actor", f.ownerId), "event_delete_failed", events.length);
  await change(table(admin, "cms_media").delete().eq("id", f.mediaId).eq("created_by", f.ownerId).eq("version", f.mediaVersion), "media_delete_failed", 1);
  const removed = await admin.storage.from("editorial-media").remove([key]);
  ensure(!removed.error, "storage_delete_failed");
  for (const [name, column, value] of [["cms_records", "id", f.blogId], ["cms_revisions", "record_id", f.blogId], ["cms_media", "id", f.mediaId], ["editorial_media_events", "media_id", f.mediaId]]) {
    ensure(exact(await table(admin, name).select("id").eq(column, value).limit(1), `${name}_verify_failed`).length === 0, `${name}_residual`);
  }
  const remaining = await admin.storage.from("editorial-media").list({ prefix: key, limit: 10 });
  ensure(!remaining.error && Array.isArray(remaining.data?.data) && !remaining.data.data.some((o) => o.key === key), "storage_residual");
  console.log("Exact disposable Blog and cover removed; owner Blog audit records preserved.");
}

try { await main(); } catch (error) {
  console.error(`Cleanup stopped: ${/^[a-z0-9_]+$/.test(error?.label ?? "") ? error.label : "operation_failed"}.`);
  process.exitCode = 1;
}
