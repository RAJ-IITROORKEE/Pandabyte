import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient } from "@clerk/backend";
import { parseDocument } from "../lib/admin/validation.ts";
import { APPROVED_WEBP_COPY_SOURCE_HASHES, buildCatalogSourcePlan } from "./catalog-source-map.mjs";
import { fingerprint, recordDecision, trackRecord, documentWithoutVariantIds, sourceReviewNotes } from "./catalog-import-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap/catalog-import");
const ledgerPath = path.join(work, "ledger.json");
const origin = "http://localhost:3000";
const projectId = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const categoryNames = { accessories: "Accessories", microcontroller: "Dev Boards", sensors: "Sensors", shields: "Shields", "iot-kits": "IoT Kits" };
const ensure = (condition, label) => { if (!condition) throw new Error(label); };
const sha = async (bytes) => { const { createHash } = await import("node:crypto"); return createHash("sha256").update(bytes).digest("hex"); };

async function main() {
  const args = process.argv.slice(2);
  ensure(args.length === 1 && ["--dry-run", "--apply"].includes(args[0]), "use_dry_run_or_apply");
  const apply = args[0] === "--apply";
  const config = JSON.parse(await fs.readFile(path.join(root, ".insforge/project.json"), "utf8"));
  ensure(config.project_id === projectId && config.oss_host === "https://r2g8wzib.us-east.insforge.app" &&
    process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === config.oss_host && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "development_target_mismatch");
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  ensure((await clerk.instance.get()).id === "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI", "development_identity_mismatch");
  const owner = JSON.parse(await fs.readFile(path.join(root, ".bootstrap/owner-admin-subject.json"), "utf8"));
  const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
  ensure(sessions.data.length > 0, "owner_active_session_required");
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  let cachedToken, mintedAt = 0;
  const api = async (url, { method = "GET", json, form, binary = false } = {}) => {
    if (!cachedToken || Date.now() - mintedAt > 25000) { cachedToken = (await clerk.sessions.getToken(session.id)).jwt; mintedAt = Date.now(); }
    const headers = { authorization: `Bearer ${cachedToken}`, origin };
    if (json) headers["content-type"] = "application/json";
    const response = await fetch(origin + url, { method, headers, body: json ? JSON.stringify(json) : form,
      redirect: "manual", signal: AbortSignal.timeout(90000) });
    ensure(response.ok, `admin_request_${response.status}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
  const access = await api("/api/admin/access");
  ensure(["catalog.edit", "media.manage", "content.publish", "staff.manage"].every(c => access.capabilities.includes(c)), "owner_capability_required");
  const roles = await api("/api/admin/roles?limit=50&offset=0");
  ensure(roles.items.some(r => r.userId === owner.userId && r.role === "ADMIN" && r.protected), "protected_owner_required");
  const plan = buildCatalogSourcePlan();
  ensure(plan.sourceProductCount === 44 && plan.summary.eligiblePotential === 42 && plan.summary.heldMissingSourceSku === 2, "source_accounting_changed");
  const prepared = JSON.parse(await fs.readFile(path.join(work, "prepared.json"), "utf8"));
  let ledger;
  try { ledger = JSON.parse(await fs.readFile(ledgerPath, "utf8")); }
  catch (e) { if (e.code !== "ENOENT") throw e; ledger = { schemaVersion: 1, projectId, categories: {}, products: {}, media: {}, pending: {} }; }
  ensure(ledger.schemaVersion === 1 && ledger.projectId === projectId, "ledger_target_mismatch");
  const save = async () => { if (apply) { await fs.writeFile(ledgerPath + ".tmp", JSON.stringify(ledger, null, 2)); await fs.rename(ledgerPath + ".tmp", ledgerPath); } };
  const lock = apply ? await fs.open(path.join(work, "apply.lock"), "wx") : null;
  const report = { scope: "local-development-only", mode: apply ? "apply" : "dry-run", sourceProducts: 44, eligible: 42,
    held: plan.entries.filter(e => !e.disposition.localCmsCandidate).map(e => ({ title: e.sourceIdentity.title, reason: "missing source SKU; held outside CMS" })),
    createdProducts: 0, updatedProducts: 0, unchangedProducts: 0, preservedAdminEdits: 0, createdMedia: 0, reusedMedia: 0, createdCategories: 0, entries: [] };
  const findRecord = async (module, slug) => {
    const list = await api(`/api/admin/${module}?q=${encodeURIComponent(slug)}&limit=100&offset=0`);
    const matches = list.items.filter(r => r.slug === slug);
    ensure(matches.length <= 1, "ambiguous_record");
    return matches[0] ? (await api(`/api/admin/${module}/${matches[0].id}`)).record : null;
  };
  const persist = async (module, key, document, sourceFingerprint, tracked) => {
    let current = tracked ? (await api(`/api/admin/${module}/${tracked.id}`)).record : await findRecord(module, document.slug);
    let decision = recordDecision(tracked, current, sourceFingerprint);
    if (!tracked && ledger.pending[key]) {
      ensure(current && fingerprint(documentWithoutVariantIds(current.document)) === fingerprint(documentWithoutVariantIds(document)), "unknown_create_requires_reconciliation");
      decision = "update";
    }
    ensure(decision !== "collision" && decision !== "conflict", "record_collision_requires_review");
    if (decision === "admin-edited") return { record: current, decision };
    if (decision === "unchanged") return { record: current, decision };
    if (decision === "publication-confirmed") {
      if (apply) { (module === "categories" ? ledger.categories : ledger.products)[key] = trackRecord(current, sourceFingerprint); await save(); }
      return { record: current, decision: "unchanged" };
    }
    if (!apply) return { record: current, decision };
    if (decision === "create") {
      ledger.pending[key] = { module, slug: document.slug, documentFingerprint: fingerprint(document), startedAt: new Date().toISOString() }; await save();
      current = (await api(`/api/admin/${module}`, { method: "POST", json: { document } })).record;
      const trackedNow = trackRecord(current, sourceFingerprint, true);
      (module === "categories" ? ledger.categories : ledger.products)[key] = trackedNow;
      delete ledger.pending[key]; await save();
    } else if (fingerprint(documentWithoutVariantIds(current.document)) !== fingerprint(documentWithoutVariantIds(document))) {
      const ids = new Map(current.document.variants?.map(v => [v.sku, v.id]) ?? []);
      const candidate = module === "products" ? { ...document, variants: document.variants.map(v => ({ ...v, ...(ids.get(v.sku) ? { id: ids.get(v.sku) } : {}) })) } : document;
      current = (await api(`/api/admin/${module}/${current.id}`, { method: "PATCH", json: { expectedVersion: current.version, document: candidate } })).record;
      (module === "categories" ? ledger.categories : ledger.products)[key] = trackRecord(current, sourceFingerprint, true); await save();
    }
    if (!current.publishedRevisionId || decision === "update" || decision === "publish") {
      (module === "categories" ? ledger.categories : ledger.products)[key] = trackRecord(current, sourceFingerprint, true); await save();
      current = (await api(`/api/admin/${module}/${current.id}/publish`, { method: "POST", json: { expectedVersion: current.version } })).record;
    }
    (module === "categories" ? ledger.categories : ledger.products)[key] = trackRecord(current, sourceFingerprint); await save();
    return { record: current, decision };
  };
  try {
    const categories = {};
    for (const slug of Object.keys(categoryNames)) {
      const document = parseDocument("categories", { title: categoryNames[slug], slug, summary: "", blocks: [], seoTitle: categoryNames[slug], seoDescription: "", parentId: null, position: 0, mediaIds: [] });
      ensure(document.ok, "category_document_invalid");
      const existing = await findRecord("categories", slug);
      if (existing && !ledger.categories[slug]) { ensure(existing.publishedRevisionId && existing.title === categoryNames[slug], "category_mapping_ambiguous"); categories[slug] = existing.id; continue; }
      const result = await persist("categories", slug, document.value, fingerprint(document.value), ledger.categories[slug]);
      if (result.record) categories[slug] = result.record.id;
      if (result.decision === "create" && apply) report.createdCategories++;
    }
    for (const entry of plan.entries) {
      if (!entry.disposition.localCmsCandidate) continue;
      const key = entry.sourceIdentity.sourceId;
      const sourceFingerprint = fingerprint({ source: entry.sourceIdentity, fields: entry.documentFields, issues: entry.reviewIssues,
        categories: entry.sourceCategorySlugs,
        observations: entry.privateSourcePriceObservations, gallery: entry.gallery.map(a => ({ id: a.assetId, hash: a.sha256 })) });
      const tracked = ledger.products[key];
      if (tracked) {
        const current = (await api(`/api/admin/products/${tracked.id}`)).record;
        const decision = recordDecision(tracked, current, sourceFingerprint);
        if (decision === "unchanged" || decision === "admin-edited") {
          report[decision === "unchanged" ? "unchangedProducts" : "preservedAdminEdits"]++;
          report.entries.push({ title: entry.sourceIdentity.title, decision }); continue;
        }
        ensure(["update", "publish", "publication-confirmed"].includes(decision), "tracked_record_conflict");
      }
      const mediaIds = [], imageBlocks = [];
      for (const asset of entry.gallery) {
        const item = prepared.find(p => p.sourceId === key && p.assetId === asset.assetId && p.sourceSha256 === asset.sha256);
        ensure(item && !item.error && asset.integrityVerified && typeof asset.altText === "string" && asset.altText.trim() && asset.altText.length <= 300 &&
          (asset.attachmentEligible || (asset.mediaUploadStatus === "exceeds-current-4MiB-upload-limit" && item.derived && APPROVED_WEBP_COPY_SOURCE_HASHES.includes(asset.sha256))), "prepared_media_missing_or_changed");
        ensure(item.key === await sha(Buffer.from(`${key}|${asset.assetId}|${asset.sha256}`)), "prepared_cache_identity_mismatch");
        ensure(item.requestBytes <= 4 * 1024 * 1024 && item.normalizedBytes <= 4 * 1024 * 1024, "prepared_media_exceeds_limit");
        const bytes = await fs.readFile(path.join(work, "prepared", item.key + ".request"));
        const normalized = await fs.readFile(path.join(work, "prepared", item.key + ".webp"));
        ensure(bytes.length === item.requestBytes && await sha(bytes) === item.requestSha256 && await sha(normalized) === item.normalizedSha256, "prepared_media_hash_mismatch");
        let trackedMedia = ledger.media[item.key];
        const source = entry.sourceIdentity.sourceUrl + `#gallery-${asset.galleryIndex + 1}`;
        if (!trackedMedia && apply) {
          ensure(!ledger.pending[item.key], "unknown_media_upload_requires_reconciliation");
          ledger.pending[item.key] = { kind: "media", filename: item.filename, source, normalizedSha256: item.normalizedSha256 }; await save();
          const form = new FormData(); form.set("file", new File([bytes], item.filename, { type: item.requestMime }));
          form.set("altText", asset.altText); form.set("source", source);
          const media = (await api("/api/admin/media", { method: "POST", form })).media;
          ensure(media && media.filename, "media_response_invalid");
          trackedMedia = { ...media, inputHash: asset.sha256, requestHash: await sha(bytes), normalizedSha256: item.normalizedSha256 };
          ledger.media[item.key] = trackedMedia; delete ledger.pending[item.key]; await save(); report.createdMedia++;
        } else if (trackedMedia) report.reusedMedia++;
        if (trackedMedia) {
          const delivered = await api(`/api/media/${trackedMedia.id}`, { binary: true });
          ensure(await sha(delivered) === item.normalizedSha256, "normalized_delivery_mismatch");
          if (!trackedMedia.published && apply) {
            const list = await api(`/api/admin/media?q=${encodeURIComponent(trackedMedia.filename)}&limit=50&offset=0`);
            const current = list.items.find(m => m.id === trackedMedia.id);
            ensure(current && current.altText === trackedMedia.altText && current.source === trackedMedia.source &&
              (current.version === trackedMedia.version || (current.version === trackedMedia.version + 1 && current.published)), "media_changed_requires_review");
            if (current.published) {
              ledger.media[item.key] = { ...trackedMedia, ...current }; await save();
              mediaIds.push(current.id); imageBlocks.push({ type: "image", mediaId: current.id, alt: asset.altText });
              continue;
            }
            const media = (await api(`/api/admin/media/${trackedMedia.id}`, { method: "PATCH", json: {
              expectedVersion: trackedMedia.version, altText: trackedMedia.altText, source: trackedMedia.source, published: true } })).media;
            ledger.media[item.key] = { ...trackedMedia, ...media }; await save();
          }
          mediaIds.push(trackedMedia.id); imageBlocks.push({ type: "image", mediaId: trackedMedia.id, alt: asset.altText });
        }
      }
      if (!apply && (mediaIds.length !== entry.gallery.length || entry.sourceCategorySlugs.some(s => !categories[s]))) {
        report.entries.push({ title: entry.sourceIdentity.title, decision: "create-after-category-and-media-mapping", gallery: entry.gallery.length }); continue;
      }
      const parsed = parseDocument("products", { ...entry.documentFields, categoryIds: entry.sourceCategorySlugs.map(s => categories[s]), mediaIds,
        blocks: [...entry.documentFields.blocks, ...imageBlocks], sourceObservation: entry.publicSourceObservation, sourceReview: sourceReviewNotes(entry) });
      ensure(parsed.ok, "mapped_document_invalid");
      const result = await persist("products", key, parsed.value, sourceFingerprint, tracked);
      if (apply) { ledger.products[key].provenance = { source: entry.sourceIdentity, priceObservations: entry.privateSourcePriceObservations,
        issues: entry.reviewIssues, fieldStatuses: entry.sourceFieldStatuses }; await save(); }
      report[result.decision === "create" ? "createdProducts" : result.decision === "unchanged" ? "unchangedProducts" : result.decision === "admin-edited" ? "preservedAdminEdits" : "updatedProducts"]++;
      report.entries.push({ title: entry.sourceIdentity.title, decision: result.decision, images: mediaIds.length });
      console.log(`Catalog ${report.entries.length}/42: ${entry.sourceIdentity.title}`);
    }
    await fs.writeFile(path.join(work, apply ? "apply-report.json" : "dry-run-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, entries: undefined }));
  } finally { if (lock) { await lock.close(); await fs.unlink(path.join(work, "apply.lock")); } }
}

main().catch(error => { const label = /^[a-z_0-9]+$/.test(error.message) ? error.message : "catalog_integration_stopped_safely"; console.error(label); process.exitCode = 1; });
