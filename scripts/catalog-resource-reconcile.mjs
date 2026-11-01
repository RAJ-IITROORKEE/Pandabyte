import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClerkClient } from "@clerk/backend";
import { fingerprint } from "./catalog-import-state.mjs";

const origin = "http://localhost:3000";
const projectId = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const backend = "https://r2g8wzib.us-east.insforge.app";
const instanceId = "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI";
const object = v => !!v && typeof v === "object" && !Array.isArray(v);
const fail = condition => { if (!condition) throw new Error("resource_reconciliation_stopped"); };
const slugValid = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const skuValid = value => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value);
const uuidValid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const runFile = promisify(execFile);

function https(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { return false; }
}

export function verifiedCandidate(candidate, source) {
  if (!object(candidate) || !object(source) || !slugValid(candidate.slug) || !skuValid(candidate.sku) ||
    candidate.slug !== source.slug || candidate.sku !== source.identity?.sku || candidate.sourceUrl !== source.source?.url ||
    source.source?.resolvedUrl !== candidate.sourceUrl || source.source?.status !== "observed" ||
    candidate.sourceUrl !== `https://www.pandabyte.in/product-page/${candidate.slug}` || !Array.isArray(candidate.resources) ||
    candidate.resources.length > 100 || !Array.isArray(source.resources)) return false;
  const seen = new Set();
  return candidate.resources.every(link => {
    if (!object(link) || typeof link.label !== "string" || !link.label.trim() || link.label.length > 160 ||
      /[\u0000-\u001f\u007f]/u.test(link.label) || link.label !== link.label.trim() || !https(link.url) || seen.has(link.url) ||
      (link.displayLabel !== undefined && (typeof link.displayLabel !== "string" || !link.displayLabel.trim() || link.displayLabel !== link.displayLabel.trim() || link.displayLabel.length > 160 || /[\u0000-\u001f\u007f]/u.test(link.displayLabel)))) return false;
    seen.add(link.url);
    return source.resources.some(item => item?.originalUrl === link.url && item?.label === link.label);
  });
}

function publicDraft(document) {
  if (!object(document)) return null;
  const copy = { ...document };
  delete copy.sourceReview;
  return copy;
}

export function planResourceUpdate(candidate, source, admin, published, privateRevisionEqual = false) {
  if (!verifiedCandidate(candidate, source)) return { status: "source_mismatch" };
  if (!object(admin) || admin.kind !== "product" || admin.archived !== false || !Number.isSafeInteger(admin.version) || admin.version < 1 ||
    !admin.publishedRevisionId || admin.slug !== candidate.slug || !object(admin.document) ||
    admin.document.slug !== candidate.slug || admin.document.sourceObservation?.sourceUrl !== candidate.sourceUrl ||
    !Array.isArray(admin.document.variants) || admin.document.variants.length !== 1 || admin.document.variants[0]?.sku !== candidate.sku ||
    !Array.isArray(admin.document.resources) || !object(published) || published.id !== admin.id || published.slug !== candidate.slug ||
    published.revisionId !== admin.publishedRevisionId || !object(published.document)) return { status: "record_mismatch" };
  if (fingerprint(publicDraft(admin.document)) !== fingerprint(published.document)) return { status: "draft_differs_from_published" };
  if (!privateRevisionEqual) return { status: "private_revision_unverifiable" };
  const existing = admin.document.resources;
  if (existing.some(link => !object(link) || typeof link.url !== "string" || typeof link.label !== "string")) return { status: "invalid_existing_resources" };
  const urls = new Set(existing.map(link => link.url));
  const additions = candidate.resources.filter(link => !urls.has(link.url)).map(link => ({ label: link.displayLabel ?? link.label, url: link.url }));
  if (!additions.length) return { status: "unchanged" };
  if (existing.length + additions.length > 100) return { status: "resource_limit" };
  return { status: "ready", expectedVersion: admin.version, previousRevision: admin.publishedRevisionId,
    document: { ...admin.document, resources: [...existing, ...additions] }, additions };
}

export async function inspectResourceUpdate(candidate, source, admin, published, checkRevision) {
  const preliminary = planResourceUpdate(candidate, source, admin, published);
  if (preliminary.status !== "private_revision_unverifiable") return preliminary;
  try {
    if (await checkRevision(admin) !== true) return preliminary;
  } catch { return { status: "revision_check_unavailable" }; }
  return planResourceUpdate(candidate, source, admin, published, true);
}

async function checkPublishedRevision(admin, cwd) {
  fail(slugValid(admin.slug) && uuidValid(admin.id) && uuidValid(admin.publishedRevisionId) && Number.isSafeInteger(admin.version) && admin.version > 0);
  const sql = `SELECT (r.draft = v.document) AS identical FROM public.cms_records r JOIN public.cms_revisions v ON v.id = r.published_revision_id AND v.record_id = r.id WHERE r.kind = 'product' AND r.archived_at IS NULL AND r.slug = '${admin.slug}' AND r.id = '${admin.id}'::uuid AND r.version = ${admin.version} AND r.published_revision_id = '${admin.publishedRevisionId}'::uuid LIMIT 2`;
  const npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const { stdout } = await runFile(process.execPath, [npxCli, "-y", "@insforge/cli", "--json", "db", "query", sql], { cwd, timeout: 60000, maxBuffer: 16384, windowsHide: true });
  const result = JSON.parse(stdout);
  return result?.rowCount === 1 && Array.isArray(result.rows) && result.rows.length === 1 && result.rows[0]?.identical === true;
}

async function readArchive(archivePath, allowlistPath) {
  fail(path.isAbsolute(archivePath) && path.isAbsolute(allowlistPath));
  const archive = await fs.realpath(archivePath);
  const catalog = JSON.parse(await fs.readFile(path.join(archive, "catalog.json"), "utf8"));
  const allowlist = JSON.parse(await fs.readFile(allowlistPath, "utf8"));
  fail(Array.isArray(catalog.products) && catalog.products.length === 44 && allowlist.schemaVersion === 1 && Array.isArray(allowlist.products) && allowlist.products.length <= 44);
  const bySlug = new Map();
  for (const row of catalog.products) {
    fail(object(row) && typeof row.folder === "string" && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(row.folder));
    const file = path.join(archive, ...row.folder.split("/"), "product.json");
    const canonical = await fs.realpath(file);
    fail(canonical.startsWith(archive + path.sep));
    const source = JSON.parse(await fs.readFile(canonical, "utf8"));
    fail(slugValid(source.slug) && path.basename(path.dirname(canonical)) === source.slug && source.sourceId === row.sourceId &&
      source.identity?.title === row.title && source.identity?.sku === row.sku && source.source?.url === row.sourceUrl && !bySlug.has(source.slug));
    bySlug.set(source.slug, source);
  }
  const seen = new Set();
  return allowlist.products.map(candidate => {
    fail(object(candidate) && slugValid(candidate.slug) && !seen.has(candidate.slug) && bySlug.has(candidate.slug));
    seen.add(candidate.slug);
    const source = bySlug.get(candidate.slug);
    fail(verifiedCandidate(candidate, source));
    return { candidate, source };
  });
}

async function main() {
  const args = process.argv.slice(2);
  fail((args.length === 4 || args.length === 5) && args[0] === "--archive" && args[2] === "--allowlist" && (args.length === 4 || args[4] === "--apply"));
  const rows = await readArchive(args[1], args[3]);
  const apply = args[4] === "--apply";
  const root = process.cwd();
  const config = JSON.parse(await fs.readFile(path.join(root, ".insforge", "project.json"), "utf8"));
  fail(config.project_id === projectId && config.oss_host === backend && process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === backend && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  fail((await clerk.instance.get()).id === instanceId);
  const owner = JSON.parse(await fs.readFile(path.join(root, ".bootstrap", "owner-admin-subject.json"), "utf8"));
  const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
  fail(sessions.data.length > 0);
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  let token, minted = 0;
  async function api(url, method = "GET", body) {
    if (!token || Date.now() - minted > 25000) { token = (await clerk.sessions.getToken(session.id)).jwt; minted = Date.now(); }
    const response = await fetch(origin + url, { method, headers: { authorization: `Bearer ${token}`, origin, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual", signal: AbortSignal.timeout(30000) });
    fail(response.ok);
    return response.json();
  }
  const access = await api("/api/admin/access");
  fail(["catalog.edit", "content.publish", "staff.manage"].every(capability => access.capabilities.includes(capability)));
  const roles = await api("/api/admin/roles?limit=50&offset=0");
  fail(roles.items.some(role => role.userId === owner.userId && role.role === "ADMIN" && role.protected));
  for (const { candidate, source } of rows) {
    const list = await api(`/api/admin/products?q=${encodeURIComponent(candidate.slug)}&limit=100&offset=0`);
    const matches = list.items.filter(item => item.slug === candidate.slug);
    if (matches.length !== 1) { console.log(`${candidate.slug}: record_mismatch`); continue; }
    const admin = (await api(`/api/admin/products/${encodeURIComponent(matches[0].id)}`)).record;
    const published = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    const plan = await inspectResourceUpdate(candidate, source, admin, published, current => checkPublishedRevision(current, root));
    if (plan.status !== "ready" || !apply) { console.log(`${candidate.slug}: ${plan.status}${plan.status === "ready" ? ` (${plan.additions.length} additions)` : ""}`); continue; }
    const current = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}`)).record;
    const live = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    const recheck = await inspectResourceUpdate(candidate, source, current, live, record => checkPublishedRevision(record, root));
    fail(recheck.status === "ready" && recheck.expectedVersion === plan.expectedVersion && recheck.previousRevision === plan.previousRevision && fingerprint(recheck.document) === fingerprint(plan.document));
    const saved = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}`, "PATCH", { expectedVersion: plan.expectedVersion, document: plan.document })).record;
    fail(saved.version === plan.expectedVersion + 1 && saved.publishedRevisionId === plan.previousRevision && fingerprint(saved.document) === fingerprint(plan.document));
    const fresh = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    fail(fresh.revisionId === plan.previousRevision && fingerprint(fresh.document) === fingerprint(published.document));
    const result = (await api(`/api/admin/products/${encodeURIComponent(admin.id)}/publish`, "POST", { expectedVersion: saved.version })).record;
    fail(result.version === saved.version + 1 && fingerprint(result.document) === fingerprint(plan.document) && result.publishedRevisionId && result.publishedRevisionId !== plan.previousRevision);
    const after = (await api(`/api/published/products/${encodeURIComponent(candidate.slug)}`)).record;
    fail(after.revisionId === result.publishedRevisionId && fingerprint(after.document) === fingerprint(publicDraft(plan.document)));
    console.log(`${candidate.slug}: updated (${plan.additions.length} additions)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(() => { console.error("Resource reconciliation stopped; inspect source and version state before retrying."); process.exitCode = 1; });
