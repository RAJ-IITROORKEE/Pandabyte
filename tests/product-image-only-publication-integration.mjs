// Disposable development-only fixture. Requires the protected owner's active Clerk session.
// Run explicitly after the migration and local app are ready; this file performs no work when imported.
import { randomUUID } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { preflight } from "./phase2-isolation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journal = path.join(root, ".bootstrap", "image-publication-fixture.json");
const check = (ok, label) => { if (!ok) throw new Error(label); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  check(process.argv.length === 3 && process.argv[2] === "--run", "explicit_run_required");
  const context = await preflight();
  const owner = JSON.parse(await readFile(path.join(root, ".bootstrap", "owner-admin-subject.json"), "utf8"));
  const sessions = await context.clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
  check(sessions.data.length > 0, "owner_active_session_required");
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  const run = randomUUID().replaceAll("-", "");
  const slug = `image-publication-fixture-${run}`;
  const state = { slug, productId: null, media: [] };
  // Exclusive creation prevents overwriting evidence from an incomplete earlier run.
  await writeFile(journal, JSON.stringify(state), { flag: "wx" });
  const save = () => writeFile(journal, JSON.stringify(state));
  let token, minted = 0;
  async function request(url, { method = "GET", json, form, anonymous = false } = {}) {
    if (!anonymous && (!token || Date.now() - minted > 25000)) {
      token = (await context.clerk.sessions.getToken(session.id)).jwt; minted = Date.now();
    }
    const headers = { origin: context.appOrigin, ...(!anonymous ? { authorization: `Bearer ${token}` } : {}) };
    if (json !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(context.appOrigin + url, { method, headers, body: json === undefined ? form : JSON.stringify(json), signal: AbortSignal.timeout(30000), redirect: "manual" });
    let body; try { body = await response.json(); } catch { body = null; }
    return { status: response.status, body };
  }
  async function expect(url, options, status, label, code) {
    const result = await request(url, options);
    check(result.status === status && (!code || result.body?.error?.code === code), `${label}_${result.status}_${result.body?.error?.code ?? "unknown"}`);
    return result.body;
  }
  const productPath = () => `/api/admin/products/${state.productId}`;
  try {
    const access = await expect("/api/admin/access", {}, 200, "access");
    check(["catalog.edit", "media.manage", "content.publish", "staff.manage"].every(c => access.capabilities.includes(c)), "owner_capabilities_required");
    const roles = await expect("/api/admin/roles?limit=50&offset=0", {}, 200, "roles");
    check(roles.items.some(r => r.userId === owner.userId && r.role === "ADMIN" && r.protected), "protected_owner_required");
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#198754" } }).png().toBuffer();
    for (let i = 0; i < 3; i++) {
      const form = new FormData(); form.set("file", new File([bytes], `fixture-${i}.png`, { type: "image/png" }));
      form.set("altText", `Disposable image fixture ${run} ${i}`); form.set("source", "Synthetic image publication fixture");
      const { media } = await expect("/api/admin/media", { method: "POST", form }, 201, "media_upload");
      state.media.push(media); await save();
      if (i < 2) {
        const result = await expect(`/api/admin/media/${media.id}`, { method: "PATCH", json: { expectedVersion: media.version, altText: media.altText, source: media.source, published: true } }, 200, "media_publish");
        state.media[i] = result.media; await save();
      }
    }
    const [oldMedia, newMedia, privateMedia] = state.media;
    const sku = `FIX-${run.toUpperCase()}`;
    const document = { title: `Image publication fixture ${run}`, slug, summary: "Published fixture",
      blocks: [{ type: "image", mediaId: oldMedia.id, alt: "Fixture image" }], seoTitle: "", seoDescription: "",
      categoryIds: [], modelNumbers: [], variants: [{ sku, label: "Fixture" }], specifications: [], compatibility: [], kitContents: [], resources: [], mediaIds: [oldMedia.id] };
    const created = await expect("/api/admin/products", { method: "POST", json: { document, prices: [{ sku, expectedPriceVersion: 0, regularPricePaise: 10000, actualPricePaise: 10000, salePricePaise: null, saleStartsAt: null, saleEndsAt: null, reason: "Disposable fixture" }] } }, 201, "create_product");
    state.productId = created.record.id; await save();
    let record = (await expect(`${productPath()}/publish`, { method: "POST", json: { expectedVersion: created.record.version } }, 200, "publish_product")).record;
    const saved = await expect(productPath(), { method: "PATCH", json: { expectedVersion: record.version, document: { ...record.document, summary: "Unpublished fixture change" } } }, 200, "save_draft");
    record = saved.record;
    const endpoint = `${productPath()}/replace-published-images`;
    // A private field containing the selected image ID must block the whole operation.
    record = (await expect(productPath(), { method: "PATCH", json: { expectedVersion: record.version,
      document: { ...record.document, summary: `Private reference ${oldMedia.id}` } } }, 200, "save_private_reference")).record;
    const beforeOutside = record;
    await expect(endpoint, { method: "POST", json: { expectedVersion: record.version, expectedRevisionId: record.publishedRevisionId,
      replacements: [{ oldId: oldMedia.id, newId: newMedia.id }] } }, 409, "outside_reference", "invalid_state");
    const afterOutside = (await expect(productPath(), {}, 200, "outside_read")).record;
    check(afterOutside.version === beforeOutside.version && afterOutside.publishedRevisionId === beforeOutside.publishedRevisionId &&
      same(afterOutside.document, beforeOutside.document) && same(afterOutside.revisions, beforeOutside.revisions), "outside_reference_changed_state");
    record = (await expect(productPath(), { method: "PATCH", json: { expectedVersion: record.version,
      document: { ...record.document, summary: "Unpublished fixture change" } } }, 200, "restore_fixture_note")).record;
    const publicBefore = (await expect(`/api/published/products/${slug}`, {}, 200, "public_before")).record;
    check(record.document.summary === "Unpublished fixture change" && record.document.summary !== publicBefore.document.summary, "draft_not_distinct");
    const input = { expectedVersion: record.version, expectedRevisionId: record.publishedRevisionId, replacements: [{ oldId: oldMedia.id, newId: newMedia.id }] };
    for (const [name, options, status, code] of [
      ["anonymous", { method: "POST", json: input, anonymous: true }, 401, "unauthorized"],
      ["stale_version", { method: "POST", json: { ...input, expectedVersion: input.expectedVersion + 1 } }, 409, "version_conflict"],
      ["stale_revision", { method: "POST", json: { ...input, expectedRevisionId: randomUUID() } }, 409, "version_conflict"],
      ["private_media", { method: "POST", json: { ...input, replacements: [{ oldId: oldMedia.id, newId: privateMedia.id }] } }, 409, "invalid_state"],
      ["missing_old", { method: "POST", json: { ...input, replacements: [{ oldId: randomUUID(), newId: newMedia.id }] } }, 409, "invalid_state"],
      ["duplicate", { method: "POST", json: { ...input, replacements: [...input.replacements, ...input.replacements] } }, 400, "invalid_input"],
    ]) {
      await expect(endpoint, options, status, name, code);
      const current = (await expect(productPath(), {}, 200, `${name}_read`)).record;
      const publicCurrent = (await expect(`/api/published/products/${slug}`, {}, 200, `${name}_public`)).record;
      check(current.version === record.version && current.publishedRevisionId === record.publishedRevisionId && same(current.document, record.document) && same(current.revisions, record.revisions) && same(publicCurrent, publicBefore), `${name}_changed_state`);
    }
    const result = await expect(endpoint, { method: "POST", json: input }, 200, "replace");
    const after = (await expect(productPath(), {}, 200, "admin_after")).record;
    const live = (await expect(`/api/published/products/${slug}`, {}, 200, "public_after")).record;
    const expectedDraft = structuredClone(record.document); expectedDraft.mediaIds[0] = newMedia.id; expectedDraft.blocks[0].mediaId = newMedia.id;
    const expectedLive = structuredClone(publicBefore.document); expectedLive.mediaIds[0] = newMedia.id; expectedLive.blocks[0].mediaId = newMedia.id;
    check(after.version === record.version + 1 && after.publishedRevisionId === result.revisionId && same(after.document, expectedDraft) && same(live.document, expectedLive) && after.revisions.some(r => r.id === record.publishedRevisionId), "replacement_or_history_mismatch");
    console.log("Disposable image publication fixture passed.");
  } finally {
    let cleanupError = false;
    if (state.productId) {
      try {
        const record = (await expect(productPath(), {}, 200, "cleanup_read")).record;
        check(record.slug === slug && record.title === `Image publication fixture ${run}`, "cleanup_identity_mismatch");
        if (!record.archived) await expect(`${productPath()}/archive`, { method: "POST", json: { expectedVersion: record.version } }, 200, "cleanup_archive");
      } catch { cleanupError = true; }
    }
    for (const media of state.media) {
      try {
        if (media.published && !cleanupError) await expect(`/api/admin/media/${media.id}`, { method: "PATCH", json: { expectedVersion: media.version, altText: media.altText, source: media.source, published: false } }, 200, "cleanup_withdraw_media");
      } catch { cleanupError = true; }
    }
    if (!cleanupError && state.productId) await unlink(journal);
    else console.error("Fixture cleanup incomplete or product creation outcome unknown; retain journal for manual review.");
    if (cleanupError) throw new Error("fixture_cleanup_failed");
  }
}

main().catch(error => { console.error(`Image publication integration failed: ${error.message}`); process.exitCode = 1; });
