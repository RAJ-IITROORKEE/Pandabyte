import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ARCHIVE_ROOT = path.resolve(SCRIPT_DIR, "../products");
export const APPROVED_WEBP_COPY_SOURCE_HASHES = Object.freeze([
  "773e378b86b73e99a7dad2f64124115a299c94e32785f031b2898650d55b6a3d",
  "b84a50e08a521b3e1b29cacc1e5cd4e4c4248b5c8b0ab22c5b4e0eab4bc09d98",
  "b3e2176449425393741df13486e25741f57b4c11da7ba009370317382ed63f59",
]);
const MAX_PRODUCTS = 44;
const MAX_GALLERY_ENTRIES = 250;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const CURRENT_MEDIA_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;
const CLAIM_FIELDS = ["specifications", "compatibility", "kitContents"];
const SOURCE_CATEGORY_NAMES = ["All Products", "all-products"];
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function withinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function checkedPath(basePath, relativePath, { directory = false } = {}) {
  if (typeof relativePath !== "string" || !relativePath.trim() || relativePath.includes("\0") || relativePath.includes(":")) {
    return { ok: false, code: "invalid_relative_path" };
  }

  const parts = relativePath.replaceAll("\\", "/").split("/");
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
    parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === "3d")) {
    return { ok: false, code: "unsafe_relative_path" };
  }

  const baseRealPath = fs.realpathSync(basePath);
  const target = path.resolve(baseRealPath, ...parts);
  if (!withinRoot(baseRealPath, target)) return { ok: false, code: "path_escapes_product" };

  try {
    const stats = fs.lstatSync(target);
    if (stats.isSymbolicLink()) return { ok: false, code: "symbolic_link_not_allowed" };
    if (directory ? !stats.isDirectory() : !stats.isFile()) return { ok: false, code: directory ? "not_a_directory" : "not_a_regular_file" };
    const canonical = fs.realpathSync(target);
    if (!withinRoot(baseRealPath, canonical)) return { ok: false, code: "path_escapes_product" };
    return { ok: true, path: canonical, relativePath: parts.join("/") };
  } catch {
    return { ok: false, code: "file_unavailable" };
  }
}

function readJson(basePath, relativePath, { maxBytes = MAX_JSON_BYTES } = {}) {
  const resolved = checkedPath(basePath, relativePath);
  if (!resolved.ok) throw new Error(`${relativePath}: ${resolved.code}`);
  const stats = fs.statSync(resolved.path);
  if (stats.size > maxBytes) throw new Error(`${relativePath}: json_too_large`);
  const bytes = fs.readFileSync(resolved.path);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${relativePath}: invalid_json`);
  }
  return { value, sha256: sha256(bytes), bytes: stats.size, path: resolved.path };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function hashFile(basePath, relativePath) {
  const resolved = checkedPath(basePath, relativePath);
  if (!resolved.ok) return { ok: false, code: resolved.code, relativePath };

  const stats = fs.statSync(resolved.path);
  if (stats.size > MAX_MEDIA_BYTES) return { ok: false, code: "media_file_too_large_to_verify", relativePath, bytes: stats.size };

  const digest = createHash("sha256");
  const fd = fs.openSync(resolved.path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    let position = 0;
    while (position < stats.size) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stats.size - position), position);
      if (count === 0) return { ok: false, code: "file_read_incomplete", relativePath, bytes: stats.size };
      digest.update(buffer.subarray(0, count));
      position += count;
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    ok: true,
    relativePath: resolved.relativePath,
    absolutePath: resolved.path,
    bytes: stats.size,
    sha256: digest.digest("hex"),
  };
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isTextWithin(value, maxLength) {
  return typeof value === "string" && Array.from(value).length <= maxLength && !CONTROL_CHARS.test(value);
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function buildResourceReviews(report, followup) {
  const results = new Map();
  if (Array.isArray(followup.results)) {
    for (const result of followup.results) {
      if (typeof result.originalUrl === "string") results.set(result.originalUrl, result);
    }
  }
  return { report, followup: results };
}

function safeResources(product, resourceReviews, reviewIssues) {
  const result = [];
  for (const resource of Array.isArray(product.resources) ? product.resources : []) {
    const check = resource?.check;
    const checkFromReport = resourceReviews.report?.[resource?.originalUrl];
    const followup = resourceReviews.followup.get(resource?.originalUrl);
    const verified = isHttpsUrl(resource?.originalUrl) &&
      check?.status === "reachable-page-match" &&
      check?.finalUrl === resource.originalUrl &&
      checkFromReport?.status === "reachable-page-match" &&
      checkFromReport?.finalUrl === resource.originalUrl &&
      followup?.status === "accessible-relevant-product-page" &&
      (followup?.finalUrl ?? followup?.finalURL) === resource.originalUrl;

    if (verified && isTextWithin(resource.label, 160) && resource.label.trim()) {
      result.push({ label: resource.label, url: resource.originalUrl });
    } else {
      reviewIssues.push({
        code: "resource_not_verified_for_product",
        label: resource?.label ?? null,
        originalUrl: resource?.originalUrl ?? null,
        productCheck: check ?? null,
        latestCheck: checkFromReport ?? null,
        followupCheck: followup ?? null,
      });
    }
  }
  return result;
}

function sourceCategories(product, catalogEntry) {
  const sourceSlugs = Array.isArray(catalogEntry.categories) ? [...catalogEntry.categories] : [];
  const names = Array.isArray(product.categories?.sourceRecords)
    ? product.categories.sourceRecords
      .map((record) => record?.name)
      .filter((name) => typeof name === "string" && !SOURCE_CATEGORY_NAMES.includes(name))
    : [];
  return { slugs: sourceSlugs, sourceRecordNames: names };
}

function reviewItemIsObserved(item) {
  return item?.verification === "observed";
}

function documentClaims(product, reviewRow, rawHashMatches, reviewIssues) {
  const output = { specifications: [], compatibility: [], kitContents: [], statuses: {} };
  const ownerCodes = new Set((reviewRow?.ownerIssues ?? []).map((issue) => issue?.code));

  for (const field of CLAIM_FIELDS) {
    const proposal = reviewRow?.proposedReplacements?.[field];
    const fieldReviewMatches = rawHashMatches && proposal?.review?.rawSha256 === product.source?.rawSha256;
    output.statuses[field] = {
      status: proposal?.status ?? "not_checked",
      rawHashMatched: fieldReviewMatches,
    };

    if (!fieldReviewMatches) {
      if (proposal) reviewIssues.push({ code: "structured_review_hash_mismatch", field, status: proposal.status, rawSha256: proposal.review?.rawSha256 ?? reviewRow?.rawSha256 ?? null });
      continue;
    }

    if (proposal.status === "not_present") {
      reviewIssues.push({
        code: "source_claim_not_present",
        field,
        status: "not_present",
        meaning: "No separate source claim was observed. This does not mean an empty shipment, quantity zero, or an operational zero.",
      });
      continue;
    }

    if (proposal.status === "not_checked") {
      reviewIssues.push({ code: "source_claim_not_checked", field, status: proposal.status });
      continue;
    }

    const heldKitCollection = field === "kitContents" && ownerCodes.has("source-kit-count-reconciliation");
    const heldCompatibility = field === "compatibility" && ownerCodes.has("source-compatibility-conflict");
    if (heldKitCollection || heldCompatibility) {
      reviewIssues.push({
        code: "source_claim_collection_held_for_owner_review",
        field,
        status: proposal.status,
        items: proposal.items ?? [],
      });
      continue;
    }

    const items = Array.isArray(proposal.items) ? proposal.items : [];
    const heldItems = [];
    for (const item of items) {
      let mapped;
      if (!reviewItemIsObserved(item)) {
        heldItems.push(item);
        continue;
      }

      if (field === "specifications") {
        if (ownerCodes.has("source-compatibility-conflict") && item.name?.trim().toLocaleLowerCase("en-US") === "compatible with") {
          heldItems.push(item);
          continue;
        }
        if (isTextWithin(item.name, 120) && isTextWithin(item.value, 2000) && item.name.trim() && item.value.trim()) {
          mapped = { name: item.name, value: item.value };
        }
      } else if (field === "compatibility") {
        if (isTextWithin(item.text, 240) && item.text.trim()) mapped = item.text;
      } else if (field === "kitContents") {
        if (isTextWithin(item.title, 160) && item.title.trim() && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10_000) {
          mapped = { title: item.title, quantity: item.quantity };
        }
      }

      if (mapped === undefined) heldItems.push(item);
      else output[field].push(mapped);
    }

    if (heldItems.length > 0) {
      reviewIssues.push({ code: "source_claim_clauses_held", field, status: proposal.status, items: heldItems });
    }
  }

  return output;
}

function makeVariant(product, reviewIssues) {
  const sku = product.identity?.sku;
  const items = product.variants?.items;
  if (typeof sku !== "string" || !sku.trim()) return [];
  if (!isTextWithin(sku, 80) || sku.trim() !== sku || product.variants?.status !== "observed" || !Array.isArray(items) || items.length !== 1 || items[0]?.sku !== sku) {
    reviewIssues.push({ code: "source_variant_mapping_unverified", sourceSku: sku, sourceVariantStatus: product.variants?.status ?? null, sourceVariantCount: Array.isArray(items) ? items.length : null });
    return [];
  }

  const title = product.identity?.title;
  const label = isTextWithin(title, 120) && title.trim() ? title : sku;
  return [{ sku, label, labelSource: label === title ? "identity.title" : "identity.sku" }];
}

function getPrimarySourceObservation(product) {
  const prices = product.commercialObservations?.prices;
  if (!Array.isArray(prices)) return null;
  const price = prices.find((item) => item?.field === "formattedPrice");
  if (!price || !isTextWithin(price.text, 160) || !price.text.trim() ||
    typeof price.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(price.capturedAt) ||
    Number.isNaN(Date.parse(price.capturedAt)) || !isHttpsUrl(product.source?.url)) return null;
  const explicitCurrency = typeof price.currency === "string" && price.currency.trim().length > 0;
  const validPaise = Number.isSafeInteger(price.paise) && price.paise >= 0;
  if (!(price.currency === "INR" && validPaise) && !explicitCurrency) return null;
  return { priceText: price.text, capturedAt: price.capturedAt, sourceUrl: product.source.url };
}

function collectAssets(product, productDirectory, manifest, pixelRecords, reviewIssues) {
  const assetsById = new Map((Array.isArray(manifest.assets) ? manifest.assets : []).map((asset) => [asset?.id, asset]));
  const gallery = [];

  for (const [galleryIndex, occurrence] of (Array.isArray(manifest.gallery) ? manifest.gallery : []).entries()) {
    const assetId = occurrence?.assetId;
    const asset = assetsById.get(assetId);
    if (!asset) {
      const invalid = { galleryIndex, declaredPosition: occurrence?.position ?? null, assetId: assetId ?? null, disposition: "missing_manifest_asset", attachmentEligible: false };
      gallery.push(invalid);
      reviewIssues.push({ code: "gallery_asset_missing", assetId: invalid.assetId, galleryIndex });
      continue;
    }

    const processed = asset.processed ?? {};
    const original = asset.original ?? {};
    const processedSelected = processed.status === "passed";
    const sourceHash = hashFile(productDirectory, original.path);
    const selectedHash = processedSelected ? hashFile(productDirectory, processed.path) : sourceHash;
    const pixelReview = pixelRecords.get(`${product.sourceId}|${assetId}`) ?? null;
    const sourceHashMatches = sourceHash.ok && isSha256(original.sha256) && sourceHash.sha256 === original.sha256;
    const outputHashMatches = processedSelected && selectedHash.ok && isSha256(processed.sha256) && selectedHash.sha256 === processed.sha256;
    const preserveOriginal = processed.status === "preserve-original" && original.status === "downloaded" &&
      ["technical-diagram", "infographic"].includes(asset.classification) &&
      asset.classificationReview?.status === "source-visually-reviewed" &&
      asset.classificationReview?.sourceSHA256 === original.sha256;
    const outputReviewMatches = processedSelected && processed.review === "passed" &&
      processed.visualQA?.outputSHA256 === processed.sha256 &&
      pixelReview?.status === "passed" && pixelReview?.sourceSHA256 === original.sha256 &&
      pixelReview?.outputSHA256 === processed.sha256;
    const disposition = processedSelected
      ? sourceHashMatches && outputHashMatches && outputReviewMatches ? "accepted-processed" : "blocked-integrity-or-review"
      : preserveOriginal && sourceHashMatches ? "preserved-original" : `not-selected-${processed.status ?? "unknown"}`;
    const integrityVerified = disposition === "accepted-processed" || disposition === "preserved-original";
    const altText = typeof asset.classificationReview?.evidence === "string" &&
      asset.classificationReview.evidence.length <= 240 &&
      asset.classificationReview?.sourceSHA256 === original.sha256
      ? asset.classificationReview.evidence
      : null;
    const selectedFile = integrityVerified ? selectedHash : null;
    const mediaUploadStatus = !integrityVerified
      ? "not-eligible"
      : !altText
        ? "missing-alt-evidence"
        : selectedFile.bytes > CURRENT_MEDIA_UPLOAD_LIMIT_BYTES
          ? "exceeds-current-4MiB-upload-limit"
          : "within-current-4MiB-upload-limit";
    const attachmentEligible = mediaUploadStatus === "within-current-4MiB-upload-limit";
    const result = {
      galleryIndex,
      declaredPosition: occurrence?.position ?? null,
      assetId,
      classification: asset.classification ?? "unknown",
      disposition,
      integrityVerified,
      attachmentEligible,
      mediaUploadStatus,
      currentMediaUploadLimitBytes: CURRENT_MEDIA_UPLOAD_LIMIT_BYTES,
      relativePath: selectedFile?.relativePath ?? null,
      absolutePath: selectedFile?.absolutePath ?? null,
      bytes: selectedFile?.bytes ?? selectedHash.bytes ?? sourceHash.bytes ?? null,
      mime: processedSelected ? processed.mime ?? null : original.mime ?? null,
      sha256: selectedFile?.sha256 ?? null,
      manifestOutputSha256: processedSelected ? processed.sha256 ?? null : null,
      sourceOriginalPath: original.path ?? null,
      sourceOriginalSha256: original.sha256 ?? null,
      actualSourceOriginalSha256: sourceHash.ok ? sourceHash.sha256 : null,
      processedStatus: processed.status ?? null,
      processedReview: processed.review ?? null,
      pixelReviewStatus: pixelReview?.status ?? null,
      altText,
      altTextEvidence: altText ? "classificationReview.evidence" : null,
      sourceReferences: (asset.sourceReferences ?? []).map((reference) => ({
        url: reference.url ?? null,
        origin: reference.origin ?? null,
        sourceIndex: reference.sourceIndex ?? null,
        title: reference.title ?? null,
        altText: reference.altText ?? null,
        mediaType: reference.mediaType ?? null,
      })),
    };

    if (occurrence.position !== galleryIndex) {
      reviewIssues.push({ code: "gallery_position_differs_from_manifest_order", assetId, galleryIndex, declaredPosition: occurrence.position ?? null });
    }
    if (!sourceHashMatches) reviewIssues.push({ code: "original_asset_hash_or_path_invalid", assetId, path: original.path ?? null, result: sourceHash });
    if (processedSelected && !outputHashMatches) reviewIssues.push({ code: "processed_asset_hash_or_path_invalid", assetId, path: processed.path ?? null, expectedSha256: processed.sha256 ?? null, result: selectedHash });
    if (processedSelected && !outputReviewMatches) reviewIssues.push({ code: "processed_asset_review_not_current_or_passed", assetId, processedStatus: processed.status, processedReview: processed.review, pixelReviewStatus: pixelReview?.status ?? null });
    if (processed.status === "preserve-original" && !attachmentEligible) reviewIssues.push({ code: "preserved_original_not_safe_to_select", assetId, originalStatus: original.status ?? null, classification: asset.classification ?? null, classificationReview: asset.classificationReview ?? null });
    if (!altText) reviewIssues.push({ code: "image_alt_evidence_unavailable", assetId });

    gallery.push(result);
  }
  return gallery;
}

function mapEntry(archiveRoot, catalogEntry, reviewRows, pixelRecords, resourceReviews) {
  const productDirectoryResult = checkedPath(archiveRoot, catalogEntry.folder, { directory: true });
  if (!productDirectoryResult.ok) throw new Error(`${catalogEntry.folder}: ${productDirectoryResult.code}`);
  const productDirectory = productDirectoryResult.path;
  const productFile = readJson(productDirectory, "product.json");
  const product = productFile.value;
  if (!product || typeof product !== "object" || Array.isArray(product)) throw new Error(`${catalogEntry.folder}/product.json: invalid_product_record`);
  if (product.sourceId !== catalogEntry.sourceId) throw new Error(`${catalogEntry.folder}: source_identity_mismatch`);

  const manifestReference = product.images?.manifest;
  const manifestFile = readJson(productDirectory, manifestReference);
  const manifest = manifestFile.value;
  if (manifest?.sourceId !== product.sourceId || !Array.isArray(manifest.gallery) || !Array.isArray(manifest.assets)) {
    throw new Error(`${catalogEntry.folder}/manifest: invalid_manifest_shape_or_identity`);
  }
  if (manifest.gallery.length > MAX_GALLERY_ENTRIES || manifest.assets.length > MAX_GALLERY_ENTRIES) throw new Error(`${catalogEntry.folder}/manifest: too_many_assets`);

  const reviewRow = reviewRows.get(product.sourceId) ?? null;
  const rawHashMatches = isSha256(product.source?.rawSha256) && reviewRow?.rawSha256 === product.source.rawSha256;
  const reviewIssues = [];
  if (!reviewRow) reviewIssues.push({ code: "structured_review_missing" });
  if (reviewRow && !rawHashMatches) reviewIssues.push({ code: "structured_review_hash_mismatch", expectedRawSha256: product.source?.rawSha256 ?? null, reviewRawSha256: reviewRow.rawSha256 ?? null });

  const claims = documentClaims(product, reviewRow, rawHashMatches, reviewIssues);
  const ownerIssues = Array.isArray(reviewRow?.ownerIssues) ? reviewRow.ownerIssues : [];
  reviewIssues.push(...ownerIssues.map((issue) => ({ code: issue.code ?? "owner_review_issue", ...issue })));
  if (Array.isArray(reviewRow?.missingResourceLabels)) {
    reviewIssues.push(...reviewRow.missingResourceLabels.map((issue) => ({ code: "resource_label_without_destination", ...issue })));
  }

  const safeResourceLinks = safeResources(product, resourceReviews, reviewIssues);
  const hasUnresolvedStructuredClauses = CLAIM_FIELDS.some((field) => {
    const items = reviewRow?.proposedReplacements?.[field]?.items;
    return Array.isArray(items) && items.some((item) => !reviewItemIsObserved(item));
  });
  const hasContentReviewIssues = ownerIssues.length > 0 || !rawHashMatches ||
    hasUnresolvedStructuredClauses ||
    Object.values(claims.statuses).some((field) => field.status === "conflicting" || !field.rawHashMatched);
  const description = Array.isArray(product.sections)
    ? product.sections.find((section) => section?.title?.trim().toLocaleLowerCase("en-US") === "description")
    : null;
  const summary = !hasContentReviewIssues && isTextWithin(description?.text, 1000)
    ? description.text
    : "";
  if (!summary && description?.text && hasContentReviewIssues) reviewIssues.push({ code: "description_withheld_due_to_source_review_issues", sectionId: description.id ?? null });

  const sourceSku = product.identity?.sku;
  const variantRows = makeVariant(product, reviewIssues);
  let modelNumbers = [];
  if (Array.isArray(product.modelNumbers)) {
    const observedModels = product.modelNumbers;
    const uniqueModels = new Set(observedModels.map((model) => typeof model === "string" ? model.toLocaleLowerCase("en-US") : ""));
    if (observedModels.every((model) => isTextWithin(model, 80) && model.trim()) && uniqueModels.size === observedModels.length) {
      modelNumbers = [...observedModels];
    } else {
      reviewIssues.push({ code: "source_model_numbers_not_valid_for_catalog_document", values: observedModels });
    }
  }
  const productTitle = product.identity?.title;
  const documentIdentityValid = isTextWithin(productTitle, 160) && !!productTitle?.trim() &&
    typeof product.slug === "string" && product.slug.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(product.slug);
  const identityMatches = path.posix.basename(catalogEntry.folder.replaceAll("\\", "/")) === product.slug &&
    catalogEntry.title === productTitle &&
    catalogEntry.sku === sourceSku;
  if (!identityMatches) reviewIssues.push({ code: "catalog_identity_fields_differ_from_product_json" });

  const missingSku = typeof sourceSku !== "string" || !sourceSku.trim();
  const variantValid = missingSku || variantRows.length === 1;
  const eligible = identityMatches && documentIdentityValid && !missingSku && variantValid && product.source?.status === "observed";
  const disposition = missingSku
    ? "hold-missing-source-sku"
    : eligible ? "eligible-potential" : "hold-source-identity-or-variant-review";
  if (missingSku) reviewIssues.push({ code: "missing_source_sku_cannot_enter_current_cms_schema", disposition: "outside-cms-until-real-source-sku" });

  const categoryEvidence = sourceCategories(product, catalogEntry);
  if (JSON.stringify(categoryEvidence.slugs) !== JSON.stringify(product.categories?.sourceSlugs ?? [])) {
    reviewIssues.push({ code: "catalog_category_slugs_differ_from_product_record" });
  }

  const sourcePriceObservations = Array.isArray(product.commercialObservations?.prices)
    ? product.commercialObservations.prices.map((price) => ({ ...price }))
    : [];
  const gallery = collectAssets(product, productDirectory, manifest, pixelRecords, reviewIssues);
  const rawCacheIndependentSource = {
    sourceId: product.sourceId,
    relativeFolder: catalogEntry.folder,
    slug: product.slug,
    title: product.identity?.title ?? null,
    sourceSku: sourceSku ?? null,
    sourceUrl: product.source?.url ?? null,
    resolvedUrl: product.source?.resolvedUrl ?? null,
    capturedAt: product.source?.capturedAt ?? null,
    captureTimeProvenance: product.source?.captureTimeProvenance ?? null,
    sourceStatus: product.source?.status ?? null,
    sourceRawSha256: product.source?.rawSha256 ?? null,
    productJsonSha256: productFile.sha256,
    manifestJsonSha256: manifestFile.sha256,
    sourceOwnerReviewStatus: product.reviewStatus?.owner ?? null,
    sourceFactualReviewStatus: product.reviewStatus?.factualQA ?? null,
    structuredReviewRawSha256: reviewRow?.rawSha256 ?? null,
    structuredReviewRawHashMatches: rawHashMatches,
  };

  const documentFields = {
    title: productTitle ?? "",
    slug: product.slug ?? "",
    summary,
    blocks: [],
    seoTitle: productTitle ?? "",
    seoDescription: summary.length <= 320 ? summary : "",
    modelNumbers,
    variants: variantRows.map(({ sku, label }) => ({ sku, label })),
    specifications: claims.specifications,
    compatibility: claims.compatibility,
    kitContents: claims.kitContents,
    resources: safeResourceLinks,
  };

  return {
    sourceIdentity: rawCacheIndependentSource,
    sourceCategorySlugs: categoryEvidence.slugs,
    sourceCategoryRecordNames: categoryEvidence.sourceRecordNames,
    sourceMainAssetId: manifest.mainAssetId ?? null,
    disposition: {
      status: disposition,
      localCmsCandidate: eligible,
      scope: "local-development-only",
      blockers: missingSku ? ["real source SKU required; owner chose hold outside CMS"] : eligible ? [] : ["source identity or single observed variant requires review"],
    },
    documentFields,
    sourceFieldStatuses: claims.statuses,
    publicSourceObservation: eligible ? getPrimarySourceObservation(product) : null,
    privateSourcePriceObservations: {
      prices: sourcePriceObservations,
      listingPriceText: product.commercialObservations?.listingPriceText ?? null,
      sourceUrl: product.source?.url ?? null,
      capturedAt: product.source?.capturedAt ?? null,
      captureTimeProvenance: product.source?.captureTimeProvenance ?? null,
      sourceRawSha256: product.source?.rawSha256 ?? null,
    },
    sourceReviewContext: {
      ownerStatus: product.reviewStatus?.owner ?? null,
      sourceReviewMeaning: product.source?.sourceRelativeReview?.meaning ?? null,
      technicalTruthCertified: reviewRow?.technicalTruthCertified ?? false,
      ownerFactualApproval: reviewRow?.ownerFactualApproval ?? product.reviewStatus?.owner ?? null,
    },
    reviewIssues,
    gallery,
  };
}

export function buildCatalogSourcePlan(archiveRoot = DEFAULT_ARCHIVE_ROOT) {
  const root = fs.realpathSync(path.resolve(archiveRoot));
  if (!fs.statSync(root).isDirectory()) throw new Error("archive_root_not_a_directory");

  const catalog = readJson(root, "catalog.json").value;
  const reviewReport = readJson(root, "reports/structured-field-review.json").value;
  const pixelReport = readJson(root, "reports/pixel-provenance.json").value;
  const resourceReport = readJson(root, "reports/resource-checks.json").value;
  const resourceFollowup = readJson(root, "reports/resource-followup.json").value;
  if (!Array.isArray(catalog.products) || catalog.products.length > MAX_PRODUCTS) throw new Error("invalid_or_unbounded_catalog");

  const reviewRows = new Map();
  for (const row of reviewReport.products ?? []) {
    if (!row?.sourceId || reviewRows.has(row.sourceId)) throw new Error("duplicate_or_invalid_structured_review_identity");
    reviewRows.set(row.sourceId, row);
  }
  const pixelRecords = new Map();
  for (const record of pixelReport.results ?? []) {
    const key = `${record?.sourceId}|${record?.assetId}`;
    if (!record?.sourceId || !record?.assetId || pixelRecords.has(key)) throw new Error("duplicate_or_invalid_pixel_review_identity");
    pixelRecords.set(key, record);
  }
  const resourceReviews = buildResourceReviews(resourceReport, resourceFollowup);

  const seenIds = new Set();
  const seenFolders = new Set();
  const entries = catalog.products.map((catalogEntry) => {
    if (!catalogEntry?.sourceId || !catalogEntry?.folder || seenIds.has(catalogEntry.sourceId) || seenFolders.has(catalogEntry.folder)) {
      throw new Error("duplicate_or_invalid_catalog_entry");
    }
    seenIds.add(catalogEntry.sourceId);
    seenFolders.add(catalogEntry.folder);
    return mapEntry(root, catalogEntry, reviewRows, pixelRecords, resourceReviews);
  });

  const gallery = entries.flatMap((entry) => entry.gallery);
  return {
    schemaVersion: 1,
    mode: "read-only-source-mapping-plan",
    expectedSourceProducts: 44,
    sourceProductCount: entries.length,
    summary: {
      eligiblePotential: entries.filter((entry) => entry.disposition.status === "eligible-potential").length,
      heldMissingSourceSku: entries.filter((entry) => entry.disposition.status === "hold-missing-source-sku").length,
      otherHeld: entries.filter((entry) => entry.disposition.status === "hold-source-identity-or-variant-review").length,
      sourceCategoryMemberships: entries.reduce((count, entry) => count + entry.sourceCategorySlugs.length, 0),
      galleryEntries: gallery.length,
      acceptedProcessed: gallery.filter((asset) => asset.disposition === "accepted-processed").length,
      preservedOriginal: gallery.filter((asset) => asset.disposition === "preserved-original").length,
      blockedOrUnselectedAssets: gallery.filter((asset) => !asset.attachmentEligible).length,
      aboveCurrentMediaUploadLimit: gallery.filter((asset) => asset.mediaUploadStatus === "exceeds-current-4MiB-upload-limit").length,
    },
    entries,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(buildCatalogSourcePlan(), null, 2)}\n`);
}
