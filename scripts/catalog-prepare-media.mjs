import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { APPROVED_WEBP_COPY_SOURCE_HASHES, buildCatalogSourcePlan } from "./catalog-source-map.mjs";
import { prepareEditorialFile } from "../lib/editorial/media.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap/catalog-import");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
// The owner approved working WebP copies for these three exact oversized PNGs only.
const approvedCopies = new Set(APPROVED_WEBP_COPY_SOURCE_HASHES);

async function main() {
  assert.equal(process.argv.length, 2, "No command options are supported");
  const plan = buildCatalogSourcePlan();
  const results = [];
  await fs.mkdir(path.join(work, "prepared"), { recursive: true });
  for (const entry of plan.entries.filter(e => e.disposition.localCmsCandidate)) {
    for (const asset of entry.gallery) {
      assert.ok(asset.integrityVerified && (asset.attachmentEligible || approvedCopies.has(asset.sha256)), "Media is not approved for preparation");
      let bytes = await fs.readFile(asset.absolutePath), mime = asset.mime;
      assert.equal(hash(bytes), asset.sha256, "Source changed during preparation");
      const derived = bytes.length > 4 * 1024 * 1024;
      if (derived) {
        assert.ok(approvedCopies.has(asset.sha256), "Oversized source needs owner approval");
        bytes = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" }).rotate().webp({ quality: 90 }).toBuffer();
        mime = "image/webp";
      }
      assert.ok(bytes.length <= 4 * 1024 * 1024, "Prepared request exceeds upload limit");
      const filename = `${entry.sourceIdentity.slug.slice(0, 85)}-view-${asset.galleryIndex + 1}.${mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg"}`;
      const prepared = await prepareEditorialFile(new File([bytes], filename, { type: mime }));
      assert.ok(prepared, "Existing media normalizer rejected the request");
      const key = hash(Buffer.from(`${entry.sourceIdentity.sourceId}|${asset.assetId}|${asset.sha256}`));
      await fs.writeFile(path.join(work, "prepared", key + ".request"), bytes);
      await fs.writeFile(path.join(work, "prepared", key + ".webp"), prepared.bytes);
      results.push({ key, sourceId: entry.sourceIdentity.sourceId, assetId: asset.assetId, sourceSha256: asset.sha256,
        sourceBytes: asset.bytes, requestSha256: hash(bytes), requestBytes: bytes.length, requestMime: mime, filename,
        normalizedSha256: hash(prepared.bytes), normalizedBytes: prepared.bytes.length, width: prepared.width,
        height: prepared.height, hasAlpha: (await sharp(prepared.bytes).metadata()).hasAlpha, derived });
    }
  }
  await fs.writeFile(path.join(work, "prepared.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ assets: results.length, derivedCopies: results.filter(r => r.derived).length,
    maxNormalizedBytes: Math.max(...results.map(r => r.normalizedBytes)) }));
}

main().catch(() => { console.error("catalog_media_preparation_stopped_safely"); process.exitCode = 1; });
