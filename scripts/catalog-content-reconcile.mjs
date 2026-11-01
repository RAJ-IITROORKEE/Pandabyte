import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { fingerprint } from "./catalog-import-state.mjs";

const origin = "http://localhost:3000";
const projectId = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const backend = "https://r2g8wzib.us-east.insforge.app";
const instanceId = "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI";
const runFile = promisify(execFile);
const object = value => !!value && typeof value === "object" && !Array.isArray(value);
const fail = condition => { if (!condition) throw new Error("content_reconciliation_stopped"); };
const slugValid = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const uuidValid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hashValid = value => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
const text = (value, max) => typeof value === "string" && value === value.trim() && !!value && Array.from(value).length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const https = value => {
  if (!text(value, 2048) || /[\r\n\t]/.test(value)) return false;
  try { const u = new URL(value); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; }
};

export function verifiedContentCandidate(candidate, source, archiveFileSha256) {
  if (!object(candidate) || !object(source) || !slugValid(candidate.slug) || !text(candidate.sku, 80) ||
    candidate.slug !== source.slug || candidate.sku !== source.identity?.sku ||
    candidate.sourceUrl !== `https://www.pandabyte.in/product-page/${candidate.slug}` ||
    candidate.sourceUrl !== source.source?.url || candidate.sourceUrl !== source.source?.resolvedUrl || source.source?.status !== "observed" ||
    !hashValid(candidate.rawSha256) || candidate.rawSha256 !== source.source?.rawSha256 ||
    !hashValid(candidate.archiveFileSha256) || candidate.archiveFileSha256 !== archiveFileSha256 ||
    !Array.isArray(candidate.excerpts) || candidate.excerpts.length > 50 || !Array.isArray(source.sections)) return false;
  const info = source.sections.filter(section => section?.title === "PRODUCT INFO" && typeof section.text === "string");
  if (candidate.excerpts.length && info.length !== 1) return false;
  const seen = new Set();
  for (const excerpt of candidate.excerpts) {
    if (!text(excerpt, 1000) || seen.has(excerpt) || !info[0]?.text.includes(excerpt)) return false;
    seen.add(excerpt);
  }
  // Supplemental destinations are an explicit human-reviewed allowlist, never discovery output.
  const links = candidate.supplementalLinks ?? [];
  if (!Array.isArray(links) || links.length > 100) return false;
  const urls = new Set();
  return links.every(link => {
    if (!object(link) || !text(link.label, 160) || !https(link.url) || !https(link.evidenceSourceUrl) ||
      !text(link.evidence, 2000) || urls.has(link.url)) return false;
    urls.add(link.url); return true;
  }) && (candidate.excerpts.length > 0 || links.length > 0);
}

export function publicContentDocument(document) {
  if (!object(document)) return null;
  const copy = { ...document }; delete copy.sourceReview; return copy;
}

export function planContentUpdate(candidate, source, admin, published, privateRevisionEqual = false, archiveFileSha256) {
  if (!verifiedContentCandidate(candidate, source, archiveFileSha256)) return { status: "source_mismatch" };
  if (!object(admin) || admin.kind !== "product" || admin.archived !== false || !Number.isSafeInteger(admin.version) || admin.version < 1 ||
    !admin.publishedRevisionId || admin.slug !== candidate.slug || !object(admin.document) || admin.document.slug !== candidate.slug ||
    admin.document.sourceObservation?.sourceUrl !== candidate.sourceUrl || !Array.isArray(admin.document.variants) ||
    admin.document.variants.length !== 1 || admin.document.variants[0]?.sku !== candidate.sku || !Array.isArray(admin.document.blocks) ||
    !Array.isArray(admin.document.resources) || !object(published) || published.id !== admin.id || published.slug !== candidate.slug ||
    published.revisionId !== admin.publishedRevisionId || !object(published.document)) return { status: "record_mismatch" };
  if (fingerprint(publicContentDocument(admin.document)) !== fingerprint(published.document)) return { status: "draft_differs_from_published" };
  if (!privateRevisionEqual) return { status: "private_revision_unverifiable" };
  let blocks = admin.document.blocks;
  if (blocks.some(block => !object(block) || typeof block.type !== "string")) return { status: "invalid_existing_blocks" };
  let contentAdded = false;
  if (candidate.excerpts.length) {
    if (admin.document.richContent !== undefined) return { status: "existing_rich_content" };
    const expected = [{ type: "heading", level: 2, text: "Source highlights" }, { type: "bulletList", items: candidate.excerpts }];
    const prose = blocks.filter(block => block.type !== "image");
    if (prose.length && fingerprint(prose) !== fingerprint(expected)) return { status: "existing_prose" };
    if (!prose.length) { blocks = [...blocks, ...expected]; contentAdded = true; }
  }
  const existing = admin.document.resources;
  if (existing.some(link => !object(link) || !text(link.label, 160) || !https(link.url))) return { status: "invalid_existing_resources" };
  const urls = new Set(existing.map(link => link.url));
  const additions = (candidate.supplementalLinks ?? []).filter(link => !urls.has(link.url)).map(({ label, url }) => ({ label, url }));
  if (blocks.length > 100 || existing.length + additions.length > 100) return { status: "document_limit" };
  if (!contentAdded && !additions.length) return { status: "unchanged" };
  return { status: "ready", expectedVersion: admin.version, previousRevision: admin.publishedRevisionId, contentAdded,
    additions, document: { ...admin.document, blocks, resources: [...existing, ...additions] } };
}

export function revisionQuery(records) {
  fail(Array.isArray(records) && records.length > 0 && records.length <= 44);
  const seen = new Set();
  const values = records.map(record => {
    fail(slugValid(record.slug) && uuidValid(record.id) && uuidValid(record.publishedRevisionId) &&
      Number.isSafeInteger(record.version) && record.version > 0 && !seen.has(record.slug));
    seen.add(record.slug);
    return `('${record.id}'::uuid,'${record.slug}',${record.version}::bigint,'${record.publishedRevisionId}'::uuid)`;
  });
  return `WITH expected(id,slug,version,revision) AS (VALUES ${values.join(",")}) SELECT e.slug,e.version,e.revision::text AS revision,(r.draft=v.document) AS identical FROM expected e LEFT JOIN public.cms_records r ON r.id=e.id AND r.slug=e.slug AND r.version=e.version AND r.published_revision_id=e.revision AND r.kind='product' AND r.archived_at IS NULL LEFT JOIN public.cms_revisions v ON v.id=e.revision AND v.record_id=e.id`;
}

export function revisionMatches(records, response) {
  fail(object(response) && Array.isArray(response.rows) && response.rowCount === records.length && response.rows.length === records.length);
  const bySlug = new Map();
  for (const row of response.rows) {
    const record = records.find(item => item.slug === row.slug);
    fail(record && !bySlug.has(row.slug) && Number(row.version) === record.version && row.revision === record.publishedRevisionId);
    bySlug.set(row.slug, row.identical === true);
  }
  return bySlug;
}

async function checkRevisions(records, cwd) {
  const sql = revisionQuery(records);
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const { stdout } = await runFile(process.execPath, [cli, "-y", "@insforge/cli", "--json", "db", "query", sql], { cwd, timeout: 90000, maxBuffer: 65536, windowsHide: true });
  return revisionMatches(records, JSON.parse(stdout));
}

async function readJson(file, max = 4 * 1024 * 1024) {
  const info = await fs.stat(file); fail(info.isFile() && info.size <= max);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readSourceFile(file) {
  const info = await fs.stat(file); fail(info.isFile() && info.size <= 4 * 1024 * 1024);
  const bytes = await fs.readFile(file); fail(bytes.length <= 4 * 1024 * 1024);
  return { source: JSON.parse(bytes.toString("utf8")), archiveFileSha256: createHash("sha256").update(bytes).digest("hex") };
}

async function readCandidates(archivePath, candidatePath) {
  fail(path.isAbsolute(archivePath) && path.isAbsolute(candidatePath));
  const root = await fs.realpath(archivePath);
  const catalog = await readJson(path.join(root, "catalog.json"));
  const allowlist = await readJson(candidatePath, 1024 * 1024);
  fail(Array.isArray(catalog.products) && catalog.products.length === 44 && allowlist.schemaVersion === 1 &&
    Array.isArray(allowlist.products) && allowlist.products.length <= 44);
  const bySlug = new Map();
  for (const row of catalog.products) {
    fail(object(row) && typeof row.folder === "string" && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(row.folder));
    const file = await fs.realpath(path.join(root, ...row.folder.split("/"), "product.json"));
    fail(file.startsWith(root + path.sep));
    const captured = await readSourceFile(file);
    const source = captured.source;
    fail(slugValid(source.slug) && source.sourceId === row.sourceId && source.identity?.title === row.title && source.identity?.sku === row.sku &&
      source.source?.url === row.sourceUrl && path.basename(path.dirname(file)) === source.slug && !bySlug.has(source.slug));
    bySlug.set(source.slug, { ...captured, file });
  }
  const seen = new Set();
  return allowlist.products.map(candidate => {
    const captured = bySlug.get(candidate?.slug);
    fail(object(candidate) && captured && !seen.has(candidate.slug) && verifiedContentCandidate(candidate, captured.source, captured.archiveFileSha256));
    seen.add(candidate.slug); return { candidate, ...captured };
  });
}

async function main() {
  const args = process.argv.slice(2);
  fail((args.length === 4 || args.length === 5) && args[0] === "--archive" && args[2] === "--allowlist" && (args.length === 4 || args[4] === "--apply"));
  const rows = await readCandidates(args[1], args[3]);
  const apply = args[4] === "--apply";
  const cwd = process.cwd();
  const config = await readJson(path.join(cwd, ".insforge", "project.json"));
  fail(config.project_id === projectId && config.oss_host === backend && process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === backend && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }); fail((await clerk.instance.get()).id === instanceId);
  const owner = await readJson(path.join(cwd, ".bootstrap", "owner-admin-subject.json"));
  const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 }); fail(sessions.data.length > 0);
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  let token, minted = 0;
  async function api(url, method = "GET", body) {
    if (!token || Date.now() - minted > 25000) { token = (await clerk.sessions.getToken(session.id)).jwt; minted = Date.now(); }
    const response = await fetch(origin + url, { method, headers: { authorization: `Bearer ${token}`, origin, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(60000) });
    fail(response.ok); return response.json();
  }
  const access = await api("/api/admin/access"); fail(["catalog.edit", "content.publish", "staff.manage"].every(capability => access.capabilities.includes(capability)));
  const roles = await api("/api/admin/roles?limit=50&offset=0"); fail(roles.items.some(role => role.userId === owner.userId && role.role === "ADMIN" && role.protected));
  const pending = [];
  for (const row of rows) {
    const list = await api(`/api/admin/products?q=${encodeURIComponent(row.candidate.slug)}&limit=100&offset=0`);
    const matches = list.items.filter(item => item.slug === row.candidate.slug);
    if (matches.length !== 1) { console.log(`${row.candidate.slug}: record_mismatch`); continue; }
    const admin = (await api(`/api/admin/products/${encodeURIComponent(matches[0].id)}`)).record;
    const published = (await api(`/api/published/products/${encodeURIComponent(row.candidate.slug)}`)).record;
    const preliminary = planContentUpdate(row.candidate, row.source, admin, published, false, row.archiveFileSha256);
    if (preliminary.status !== "private_revision_unverifiable") { console.log(`${row.candidate.slug}: ${preliminary.status}`); continue; }
    pending.push({ ...row, admin, published });
  }
  if (!pending.length) return;
  const equality = await checkRevisions(pending.map(row => row.admin), cwd);
  for (const row of pending) {
    const { candidate, source, admin, published } = row;
    const plan = planContentUpdate(candidate, source, admin, published, equality.get(admin.slug), row.archiveFileSha256);
    if (plan.status !== "ready" || !apply) { console.log(`${candidate.slug}: ${plan.status}${plan.status === "ready" ? ` (${plan.contentAdded ? "highlights; " : ""}${plan.additions.length} links)` : ""}`); continue; }
    const current = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}`)).record;
    const live = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    fail(current.version === admin.version && current.publishedRevisionId === admin.publishedRevisionId && fingerprint(current.document) === fingerprint(admin.document));
    const captured = await readSourceFile(row.file);
    fail(captured.archiveFileSha256 === row.archiveFileSha256);
    const recheck = planContentUpdate(candidate, captured.source, current, live, equality.get(admin.slug), captured.archiveFileSha256);
    fail(recheck.status === "ready" && fingerprint(recheck.document) === fingerprint(plan.document));
    const saved = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}`, "PATCH", { expectedVersion: plan.expectedVersion, document: plan.document })).record;
    fail(saved.version === admin.version + 1 && saved.publishedRevisionId === plan.previousRevision && fingerprint(saved.document) === fingerprint(plan.document));
    const fresh = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    fail(fresh.revisionId === published.revisionId && fingerprint(fresh.document) === fingerprint(published.document));
    const result = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}/publish`, "POST", { expectedVersion: saved.version })).record;
    fail(result.version === saved.version + 1 && fingerprint(result.document) === fingerprint(plan.document) && result.publishedRevisionId && result.publishedRevisionId !== plan.previousRevision);
    const after = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    fail(after.revisionId === result.publishedRevisionId && fingerprint(after.document) === fingerprint(publicContentDocument(plan.document)));
    console.log(`${candidate.slug}: updated (${plan.contentAdded ? "highlights; " : ""}${plan.additions.length} links)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => { console.error("Content reconciliation stopped; inspect the source and version state before retrying."); process.exitCode = 1; });
