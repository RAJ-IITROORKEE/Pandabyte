import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { createClerkClient } from "@clerk/backend";
import { buildCatalogSourcePlan } from "./catalog-source-map.mjs";
import { fingerprint } from "./catalog-import-state.mjs";
import { prepareEditorialFile } from "../lib/editorial/media.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap/catalog-import");
const originalJournalPath = path.join(work, "lossless-migration.json");
const journalPath = path.join(work, "lossless-draft-safe.json");
const max = 4 * 1024 * 1024;
const targetProducts = new Set([
  "25ddc701-7d9a-4802-b480-032a7e580a57", "5638c86c-6817-433a-abf3-1abee8d3eff6",
  "f642bf30-2a72-42c0-b268-00c610252328", "9f96ea8d-9f1c-4aa3-ac11-5bf7e49f36ad",
  "087d03ec-8d40-4095-9335-610f696a2ff2", "6733eae2-9480-4b1c-b6b6-840dfda7c1b8",
  "8c8547f1-858e-4684-8960-a1e0622a5a08",
]);
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const ensure = (ok, message) => { if (!ok) throw new Error(message); };
const uuid = value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

export function replaceReviewedImages(oldDocument, ids, replacements) {
  ensure(ids.every(id => oldDocument.mediaIds.includes(id) && replacements.has(id)), "reviewed_media_missing");
  const selected = new Set(ids);
  const document = { ...oldDocument, mediaIds: oldDocument.mediaIds.map(id => selected.has(id) ? replacements.get(id) : id),
    blocks: oldDocument.blocks.map(block => block.type === "image" && selected.has(block.mediaId) ? { ...block, mediaId: replacements.get(block.mediaId) } : block) };
  const remaining = JSON.stringify(document);
  ensure(ids.every(id => !remaining.includes(id)), "media_referenced_outside_gallery");
  return document;
}

export function reviewedPairsWithReplacements(pairs, replacements) {
  return pairs.map(pair => ({ productId: pair.productId,
    ids: pair.ids.flatMap(id => replacements.has(id) ? [id, replacements.get(id)] : [id]) }));
}

async function main() {
  ensure(process.argv.length === 3 && ["--plan", "--apply"].includes(process.argv[2]), "use_plan_or_apply");
  const apply = process.argv[2] === "--apply";
  const plan = buildCatalogSourcePlan();
  const entries = plan.entries.filter(e => e.disposition.localCmsCandidate);
  ensure(plan.sourceProductCount === 44 && entries.length === 42, "source_accounting_changed");
  const ledger = JSON.parse(await fs.readFile(path.join(work, "ledger.json"), "utf8"));
  const prepared = JSON.parse(await fs.readFile(path.join(work, "prepared.json"), "utf8"));
  ensure(ledger.projectId === "988b987b-f809-4cd5-94b2-c1d1e5cc9120" && !Object.keys(ledger.pending).length, "import_ledger_incomplete");
  const cardSource = await fs.readFile(path.join(root, "components/catalog/card-image-selection.ts"), "utf8");
  const currentPairs = [...cardSource.matchAll(/^\s*"([0-9a-f-]{36})": \[([^\]]+)\],/gm)].map(match => ({
    productId: match[1], ids: [...match[2].matchAll(/"([0-9a-f-]{36})"/g)].map(id => id[1]),
  }));
  let journal;
  try { journal = JSON.parse(await fs.readFile(journalPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const original = JSON.parse(await fs.readFile(originalJournalPath, "utf8"));
  ensure(original.projectId === ledger.projectId && !original.pending && original.pairs.length === 38 && original.scope.length === 31, "original_journal_changed");
  const pairs = original.pairs.filter(pair => !original.scope.includes(pair.productId));
  ensure(pairs.length === 7 && pairs.every(p => targetProducts.has(p.productId) && p.ids.length === 2 && p.ids.every(uuid)) &&
    new Set(pairs.map(p => p.productId)).size === 7 && new Set(pairs.flatMap(p => p.ids)).size === 14, "reviewed_card_scope_changed");
  const items = [];
  for (const entry of entries) for (const asset of entry.gallery) {
    const old = prepared.find(p => p.sourceId === entry.sourceIdentity.sourceId && p.assetId === asset.assetId && p.sourceSha256 === asset.sha256);
    ensure(old && ledger.media[old.key] && uuid(ledger.media[old.key].id), "old_media_mapping_missing");
    const productId = ledger.products[entry.sourceIdentity.sourceId]?.id;
    if (!pairs.some(p => p.productId === productId && p.ids.includes(ledger.media[old.key].id))) continue;
    ensure(asset.integrityVerified && asset.altText && ["image/png", "image/jpeg"].includes(asset.mime), "source_not_reviewed");
    const original = await fs.readFile(asset.absolutePath);
    ensure(sha(original) === asset.sha256, "source_hash_changed");
    const sourcePixels = await sharp(original, { limitInputPixels: 20000000, failOn: "error" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const candidate = await sharp(original, { limitInputPixels: 20000000, failOn: "error" }).rotate().webp({ lossless: true, exact: true }).toBuffer();
    ensure(candidate.length <= max, "lossless_output_exceeds_limit");
    const pixels = await sharp(candidate, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    ensure(sourcePixels.info.width === pixels.info.width && sourcePixels.info.height === pixels.info.height && sourcePixels.data.equals(pixels.data), "lossless_pixels_differ");
    const filename = `${entry.sourceIdentity.slug.slice(0, 85)}-view-${asset.galleryIndex + 1}.webp`;
    const normal = await prepareEditorialFile(new File([candidate], filename, { type: "image/webp" }));
    ensure(normal && sha(normal.bytes) === sha(candidate), "candidate_not_preserved");
    items.push({ sourceId: entry.sourceIdentity.sourceId, assetId: asset.assetId, oldKey: old.key, oldId: ledger.media[old.key].id,
      productId: ledger.products[entry.sourceIdentity.sourceId]?.id, hash: sha(candidate), bytes: candidate, filename,
      alt: asset.altText, source: entry.sourceIdentity.sourceUrl + `#gallery-${asset.galleryIndex + 1}` });
  }
  ensure(items.length === 14 && new Set(items.map(i => i.oldId)).size === 14 && items.every(i => uuid(i.productId)) && new Set(items.map(i => i.productId)).size === 7, "gallery_accounting_changed");
  if (!apply) { console.log(JSON.stringify({ products: 7, images: items.length, exactPixelChecks: items.length, largestBytes: Math.max(...items.map(i => i.bytes.length)) })); return; }
  const lock = await fs.open(path.join(work, "lossless-draft-safe.lock"), "wx");
  try {
    let latest;
    try { latest = JSON.parse(await fs.readFile(journalPath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    ensure(fingerprint(latest ?? null) === fingerprint(journal ?? null), "migration_journal_changed");
    journal ??= { projectId: ledger.projectId, pairs, media: {}, products: {}, pending: null };
    ensure(fingerprint(journal.pairs) === fingerprint(pairs), "migration_scope_changed");
    ensure(journal.projectId === ledger.projectId && !journal.pending, "pending_outcome_requires_manual_reconciliation");
    const save = async () => { await fs.writeFile(journalPath + ".tmp", JSON.stringify(journal, null, 2)); await fs.rename(journalPath + ".tmp", journalPath); };
    const config = JSON.parse(await fs.readFile(path.join(root, ".insforge/project.json"), "utf8"));
    ensure(config.project_id === ledger.projectId && config.oss_host === "https://r2g8wzib.us-east.insforge.app" &&
      process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === config.oss_host && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "development_target_mismatch");
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    ensure((await clerk.instance.get()).id === "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI", "development_identity_mismatch");
    const owner = JSON.parse(await fs.readFile(path.join(root, ".bootstrap/owner-admin-subject.json"), "utf8"));
    const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
    ensure(sessions.data.length > 0, "owner_active_session_required");
    const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
    const origin = "http://localhost:3001";
    let token, mintedAt = 0;
    async function api(url, { method = "GET", json, form, binary = false } = {}) {
      if (!token || Date.now() - mintedAt > 25000) { token = (await clerk.sessions.getToken(session.id)).jwt; mintedAt = Date.now(); }
      const headers = { authorization: `Bearer ${token}`, origin };
      if (json) headers["content-type"] = "application/json";
      const response = await fetch(origin + url, { method, headers, body: json ? JSON.stringify(json) : form, redirect: "manual", signal: AbortSignal.timeout(90000) });
      ensure(response.ok, `admin_request_${response.status}`);
      return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
    }
    const access = await api("/api/admin/access");
    ensure(["catalog.edit", "media.manage", "content.publish", "staff.manage"].every(c => access.capabilities.includes(c)), "owner_capability_required");
    const roles = await api("/api/admin/roles?limit=50&offset=0");
    ensure(roles.items.some(r => r.userId === owner.userId && r.role === "ADMIN" && r.protected), "protected_owner_required");
    const state = id => {
      ensure(uuid(id), "invalid_product_id");
      const sql = `SELECT r.id::text AS id, r.version, r.published_revision_id::text AS revision, v.document AS published FROM public.cms_records r JOIN public.cms_revisions v ON v.id=r.published_revision_id AND v.record_id=r.id WHERE r.id='${id}'::uuid AND r.kind='product' AND r.archived_at IS NULL`;
      const output = execSync(`npx -y @insforge/cli db query "${sql}" --json`, { cwd: root, encoding: "utf8", env: { ...process.env, INSFORGE_PROJECT_ID: ledger.projectId }, timeout: 90000 });
      const rows = JSON.parse(output).rows;
      ensure(rows?.length === 1 && rows[0].id === id && uuid(rows[0].revision) && rows[0].published, "published_revision_unavailable");
      return rows[0];
    };
    const scopedItems = items;
    // Capture each draft and revision before uploads; later edits must stop the run.
    for (const pair of pairs) {
      const record = (await api(`/api/admin/products/${pair.productId}`)).record;
      const before = state(pair.productId);
      ensure(record && record.version === Number(before.version) && record.publishedRevisionId === before.revision, "product_state_changed");
      const tracked = journal.products[pair.productId];
      if (!tracked) {
        const placeholders = new Map(pair.ids.map((id, index) => [id, `placeholder-${index}`]));
        replaceReviewedImages(record.document, pair.ids, placeholders);
        replaceReviewedImages(before.published, pair.ids, placeholders);
        journal.products[pair.productId] = { version: record.version, revision: before.revision,
          draftFingerprint: fingerprint(record.document), publishedFingerprint: fingerprint(before.published), done: false };
        await save();
      } else {
        ensure(record.version === tracked.version && record.publishedRevisionId === tracked.revision &&
          fingerprint(record.document) === tracked.draftFingerprint && fingerprint(before.published) === tracked.publishedFingerprint, "migration_product_changed");
      }
    }
    for (const item of scopedItems) {
      let current = journal.media[item.oldKey];
      if (!current) {
        journal.pending = { kind: "upload", oldKey: item.oldKey, oldId: item.oldId, hash: item.hash, filename: item.filename }; await save();
        const form = new FormData(); form.set("file", new File([item.bytes], item.filename, { type: "image/webp" }));
        form.set("altText", item.alt); form.set("source", item.source);
        const uploaded = (await api("/api/admin/media", { method: "POST", form })).media;
        ensure(uploaded && uuid(uploaded.id), "invalid_media_response");
        current = { ...uploaded, oldId: item.oldId, hash: item.hash };
        journal.media[item.oldKey] = current; journal.pending = null; await save();
      }
      ensure(current.oldId === item.oldId && current.hash === item.hash, "migration_mapping_changed");
      const listed = await api(`/api/admin/media?q=${encodeURIComponent(current.filename)}&limit=50&offset=0`);
      const mediaState = listed.items.find(media => media.id === current.id);
      ensure(mediaState && mediaState.version === current.version && mediaState.published === current.published && !mediaState.archived &&
        mediaState.altText === item.alt && mediaState.source === item.source, "migration_media_changed");
      ensure(sha(await api(`/api/media/${current.id}`, { binary: true })) === item.hash, "running_upload_pipeline_mismatch");
      if (!current.published) {
        journal.pending = { kind: "media_publish", oldKey: item.oldKey, id: current.id, version: current.version }; await save();
        const published = (await api(`/api/admin/media/${current.id}`, { method: "PATCH", json: { expectedVersion: current.version, altText: item.alt, source: item.source, published: true } })).media;
        ensure(published && published.id === current.id, "invalid_media_response");
        journal.media[item.oldKey] = { ...published, oldId: item.oldId, hash: item.hash }; journal.pending = null; await save();
      }
    }
    const replacements = new Map(scopedItems.map(i => [i.oldId, journal.media[i.oldKey].id]));
    const priorReplacements = new Map(Object.values(original.media).map(m => [m.oldId, m.id]));
    const allReplacements = new Map([...priorReplacements, ...replacements]);
    const expectedPairs = reviewedPairsWithReplacements(original.pairs, allReplacements);
    ensure(fingerprint(currentPairs) === fingerprint(expectedPairs), "update_reviewed_card_mapping_before_product_publish");
    const verifyPublic = async (pair, slug) => {
      const response = await fetch(`${origin}/api/published/products/${encodeURIComponent(slug)}`, { cache: "no-store", signal: AbortSignal.timeout(90000) });
      ensure(response.ok, "public_product_unavailable");
      const detail = (await response.json()).record;
      ensure(detail?.id === pair.productId && pair.ids.every(id => !detail.document.mediaIds.includes(id) && detail.document.mediaIds.includes(replacements.get(id))), "public_product_mapping_mismatch");
      for (const id of pair.ids) {
        const item = scopedItems.find(i => i.oldId === id);
        const image = await fetch(`${origin}/api/media/${replacements.get(id)}`, { cache: "no-store", signal: AbortSignal.timeout(90000) });
        ensure(image.ok && sha(Buffer.from(await image.arrayBuffer())) === item.hash, "public_media_mismatch");
      }
    };
    for (const pair of pairs) {
      const tracked = journal.products[pair.productId];
      const record = (await api(`/api/admin/products/${pair.productId}`)).record;
      const before = state(pair.productId);
      ensure(record && record.version === tracked.version && record.publishedRevisionId === tracked.revision &&
        Number(before.version) === tracked.version && before.revision === tracked.revision &&
        fingerprint(record.document) === tracked.draftFingerprint && fingerprint(before.published) === tracked.publishedFingerprint, "migration_product_changed");
      const privateModel = record.document.model3d;
      const verifyPrivate = async () => {
        if (privateModel && !before.published.model3d) for (const id of [privateModel.mediaId, privateModel.posterId]) {
          ensure(uuid(id), "invalid_private_model");
          const response = await fetch(`${origin}/api/media/${id}`, { cache: "no-store", signal: AbortSignal.timeout(90000) });
          ensure(response.status === 404, "private_model_exposed");
        }
      };
      await verifyPrivate();
      if (tracked.done) { await verifyPublic(pair, before.published.slug); continue; }
      const expectedDraft = replaceReviewedImages(record.document, pair.ids, replacements);
      const expectedPublished = replaceReviewedImages(before.published, pair.ids, replacements);
      journal.pending = { kind: "replace_published_images", id: pair.productId, version: record.version, revision: before.revision,
        draftFingerprint: fingerprint(expectedDraft), publishedFingerprint: fingerprint(expectedPublished) }; await save();
      await api(`/api/admin/products/${pair.productId}/replace-published-images`, { method: "POST", json: {
        expectedVersion: record.version, expectedRevisionId: before.revision,
        replacements: pair.ids.map(oldId => ({ oldId, newId: replacements.get(oldId) })) } });
      const afterRecord = (await api(`/api/admin/products/${pair.productId}`)).record;
      const after = state(pair.productId);
      ensure(afterRecord && afterRecord.version === record.version + 1 && afterRecord.publishedRevisionId === after.revision &&
        Number(after.version) === afterRecord.version && after.revision !== before.revision &&
        fingerprint(afterRecord.document) === fingerprint(expectedDraft) && fingerprint(after.published) === fingerprint(expectedPublished), "atomic_replacement_mismatch");
      await verifyPrivate();
      journal.products[pair.productId] = { version: afterRecord.version, revision: after.revision,
        draftFingerprint: fingerprint(afterRecord.document), publishedFingerprint: fingerprint(after.published), done: true };
      journal.pending = null; await save();
      await verifyPublic(pair, after.published.slug);
    }
    console.log("Reviewed product images updated through versioned development Admin APIs.");
  } finally { await lock.close(); await fs.unlink(path.join(work, "lossless-draft-safe.lock")); }

}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(/^[a-z_0-9]+$/.test(error.message) ? error.message : "lossless_migration_stopped_safely"); process.exitCode = 1; });
}
