import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "../lib/admin/validation.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ARCHIVE_ROOT = path.resolve(SCRIPT_DIR, "../products");
export const DEFAULT_LIMITS = Object.freeze({ maxDepth: 8, maxEntries: 20_000, maxJsonBytes: 4 * 1024 * 1024 });

const CLAIM_COLLECTIONS = ["specifications", "compatibility", "kitContents"];
const KNOWN_RESOURCE_STATUSES = new Set([
  "reachable-headers-only",
  "reachable-page-match",
  "blocked-or-unverified",
]);
const KNOWN_IMAGE_STATUSES = new Set([
  "passed",
  "preserve-original",
  "rejected",
  "pending",
  "failed",
  "blocked-needs-better-source",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function withinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function failure(code) {
  return { ok: false, code };
}

function readBoundedJson(filePath, allowedRoot, maxJsonBytes) {
  let canonicalPath;
  try {
    const pathStat = fs.lstatSync(filePath);
    if (pathStat.isSymbolicLink() || !pathStat.isFile()) return failure("not_a_regular_file");
    canonicalPath = fs.realpathSync(filePath);
  } catch {
    return failure("file_unavailable");
  }
  if (!withinRoot(allowedRoot, canonicalPath)) return failure("path_outside_archive");

  let fd;
  try {
    fd = fs.openSync(canonicalPath, "r");
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return failure("not_a_regular_file");
    if (stat.size > maxJsonBytes) return failure("json_size_limit");

    const chunks = [];
    const buffer = Buffer.alloc(Math.min(64 * 1024, maxJsonBytes + 1));
    let total = 0;
    while (total <= maxJsonBytes) {
      const bytesRead = fs.readSync(fd, buffer, 0, Math.min(buffer.length, maxJsonBytes + 1 - total), null);
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      total += bytesRead;
    }
    if (total > maxJsonBytes) return failure("json_size_limit");

    const bytes = Buffer.concat(chunks, total);
    try {
      return { ok: true, value: JSON.parse(bytes.toString("utf8")), bytes, sha256: sha256(bytes) };
    } catch {
      return failure("invalid_json");
    }
  } catch {
    return failure("file_unavailable");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function safeManifestPath(productDirectory, reference) {
  if (typeof reference !== "string" || !reference.trim() || path.isAbsolute(reference) || path.win32.isAbsolute(reference)) return null;
  const parts = reference.split(/[\\/]/u);
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const resolved = path.resolve(productDirectory, ...parts);
  return withinRoot(productDirectory, resolved) ? resolved : null;
}

function statusBucket(value) {
  return typeof value === "string" && KNOWN_RESOURCE_STATUSES.has(value) ? value : "unknown";
}

function summarizeManifest(product, productDirectory, maxJsonBytes) {
  const reference = isObject(product) ? product.images?.manifest : undefined;
  const manifestPath = safeManifestPath(productDirectory, reference);
  if (!manifestPath) return { state: "invalid_reference", assetCount: 0, processedStatusCounts: {} };

  const result = readBoundedJson(manifestPath, productDirectory, maxJsonBytes);
  if (!result.ok) return { state: result.code, assetCount: 0, processedStatusCounts: {} };
  if (!isObject(result.value) || !Array.isArray(result.value.assets)) {
    return { state: "invalid_manifest_shape", assetCount: 0, processedStatusCounts: {} };
  }

  const processedStatusCounts = {};
  for (const asset of result.value.assets) {
    const rawStatus = isObject(asset) && isObject(asset.processed) ? asset.processed.status : undefined;
    const status = typeof rawStatus === "string" && KNOWN_IMAGE_STATUSES.has(rawStatus) ? rawStatus : "unknown";
    processedStatusCounts[status] = (processedStatusCounts[status] ?? 0) + 1;
  }
  return {
    state: "readable",
    manifestJsonSha256: result.sha256,
    assetCount: result.value.assets.length,
    processedStatusCounts: Object.fromEntries(Object.entries(processedStatusCounts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
  };
}

function inspectProduct(record, archivePath, productJsonSha256, manifest) {
  const source = isObject(record?.source) ? record.source : {};
  const identity = isObject(record?.identity) ? record.identity : {};
  const categories = isObject(record?.categories) ? record.categories : {};
  const shape = parseDocument("products", { title: identity.title, slug: record?.slug });
  const ownerValue = record?.reviewStatus?.owner;
  const ownerReview = ownerValue === "approved" ? "approved" : ownerValue === "awaiting-owner-review" ? "pending" : "unknown";
  const sourceKey = typeof record?.sourceId === "string" ? record.sourceId.trim() || null : null;
  const sku = typeof identity.sku === "string" ? identity.sku.trim() || null : null;
  const resourceRows = Array.isArray(record?.resources) ? record.resources : [];
  const resources = { statusCounts: {}, contentVerifiedFlags: { true: 0, false: 0, unknown: 0 } };
  for (const resource of resourceRows) {
    const check = resource?.check ?? {};
    const status = statusBucket(check.status);
    resources.statusCounts[status] = (resources.statusCounts[status] ?? 0) + 1;
    const flag = check.contentVerified === true ? "true" : check.contentVerified === false ? "false" : "unknown";
    resources.contentVerifiedFlags[flag] += 1;
  }
  resources.statusCounts = Object.fromEntries(Object.entries(resources.statusCounts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const resourceFlagGaps = resources.contentVerifiedFlags.false + resources.contentVerifiedFlags.unknown;
  const claimStatuses = Object.fromEntries(CLAIM_COLLECTIONS.map((field) => {
    const status = record?.[field]?.status;
    return [field, ["observed", "conflicting", "not_checked", "not_present"].includes(status) ? status : "unknown"];
  }));
  const conflicts = Object.values(claimStatuses).filter((status) => status === "conflicting").length;
  const sourceHashValid = typeof source.rawSha256 === "string" && /^[a-f0-9]{64}$/iu.test(source.rawSha256);
  const sourceEvidencePresent = typeof source.url === "string" && source.url.startsWith("https://") && typeof source.transcript === "string" && Boolean(source.transcript.trim());
  const blockers = [
    "application_category_mapping_not_supplied",
    "application_variant_mapping_not_supplied",
    "application_media_mapping_not_supplied",
  ];
  if (ownerReview !== "approved") blockers.push(ownerReview === "pending" ? "owner_review_pending" : "owner_review_status_unknown");
  if (!sourceKey) blockers.push("source_key_missing");
  if (source.status !== "observed") blockers.push("source_capture_not_observed");
  if (!sourceHashValid) blockers.push("source_hash_missing_or_invalid");
  if (!sourceEvidencePresent) blockers.push("source_evidence_reference_missing");
  if (!sku) blockers.push("source_sku_missing");
  if (categories.assignmentStatus !== "approved") blockers.push("category_assignment_not_approved");
  if (conflicts) blockers.push("source_claim_conflicts");
  if (resourceFlagGaps) blockers.push("resource_content_flag_false_or_missing");
  if (resourceRows.length) blockers.push("resource_relevance_not_verified_by_preflight");
  if (manifest.state !== "readable") blockers.push("image_manifest_unavailable");
  if (!shape.ok) blockers.push("app_shape_probe_rejected");

  return {
    archivePath,
    productJsonSha256,
    claimedSourceSha256: sourceHashValid ? source.rawSha256.toLowerCase() : null,
    ownerReview,
    sourceStatus: source.status === "observed" ? "observed" : "unobserved_or_unknown",
    sourceSkuPresent: Boolean(sku),
    categorySourceMemberships: Array.isArray(categories.sourceSlugs) ? categories.sourceSlugs.length : 0,
    claimStatuses,
    resources: {
      count: resourceRows.length,
      ...resources,
      relevance: resourceRows.length ? "not_verified_by_preflight" : "not_applicable",
    },
    imageManifest: manifest,
    applicationMappings: "not_supplied",
    shapeProbe: { status: shape.ok ? "valid" : "invalid", errors: shape.ok ? [] : shape.fields.map(({ field, code }) => ({ field, code })) },
    importEligible: false,
    blockers,
    duplicates: { sourceKey: false, slug: false, sku: false },
    _sourceKey: sourceKey,
    _slug: typeof record?.slug === "string" ? record.slug.trim() || null : null,
    _sku: sku,
  };
}

function flagDuplicates(products, property, flag, blocker) {
  const groups = new Map();
  products.forEach(({ [property]: value }, index) => {
    if (typeof value !== "string" || !value.trim()) return;
    const normalized = value.trim().toLowerCase();
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(index);
  });
  let groupCount = 0, recordCount = 0;
  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue;
    groupCount += 1;
    recordCount += indexes.length;
    for (const index of indexes) {
      products[index].duplicates[flag] = true;
      products[index].blockers.push(blocker);
    }
  }
  return { groups: groupCount, records: recordCount };
}

function countStatus(records, predicate) {
  return records.reduce((count, record) => count + (predicate(record) ? 1 : 0), 0);
}

function buildReport(products, diagnostics, scanStats) {
  const sourceKeys = flagDuplicates(products, "_sourceKey", "sourceKey", "duplicate_source_key");
  const slugs = flagDuplicates(products, "_slug", "slug", "duplicate_source_slug");
  const skus = flagDuplicates(products, "_sku", "sku", "duplicate_source_sku");
  const shapeValid = countStatus(products, (product) => product.shapeProbe.status === "valid");
  const shapeInvalid = products.length - shapeValid;
  const processedStatusCounts = {};
  for (const product of products) {
    for (const [status, count] of Object.entries(product.imageManifest.processedStatusCounts)) {
      processedStatusCounts[status] = (processedStatusCounts[status] ?? 0) + count;
    }
  }

  const outputProducts = products.map((product) => {
    const output = { ...product };
    delete output._sourceKey;
    delete output._slug;
    delete output._sku;
    return output;
  });
  const reportDiagnostics = diagnostics.map((diagnostic) => ({ ...diagnostic }));
  if (products.length === 0 && !reportDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    reportDiagnostics.push({ severity: "error", path: "", code: "no_product_records_found" });
  }
  const sortedDiagnostics = reportDiagnostics.sort((a, b) => {
    const left = `${a.path ?? ""}\0${a.code}`;
    const right = `${b.path ?? ""}\0${b.code}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const hasErrors = sortedDiagnostics.some((diagnostic) => diagnostic.severity === "error");

  return {
    schemaVersion: 1,
    status: hasErrors ? "error" : "blocked",
    importEligible: false,
    scope: {
      mode: "archive-only-read-only-preflight",
      applicationMappingProvided: false,
      shapeProbe: "parseDocument(products) receives only archived identity.title and slug; shape validity does not establish import readiness.",
      sourceHashes: "productJsonSha256 is computed from file bytes; claimedSourceSha256 is copied from archive metadata and is not verified against transcript bytes.",
      imageCounts: "processedStatusCounts are copied from manifests; image bytes are not checked and no application media mappings are created.",
      resourceChecks: "Recorded reachability is not product/content relevance; contentVerified flags preserve true, false, or missing as unknown.",
    },
    counts: {
      ...scanStats,
      productRecords: products.length,
      ownerApproved: countStatus(products, (product) => product.ownerReview === "approved"),
      ownerReviewPending: countStatus(products, (product) => product.ownerReview === "pending"),
      ownerReviewUnknown: countStatus(products, (product) => product.ownerReview === "unknown"),
      missingSourceKeys: countStatus(products, (product) => product.blockers.includes("source_key_missing")),
      duplicateSourceKeyGroups: sourceKeys.groups,
      duplicateSourceKeyRecords: sourceKeys.records,
      duplicateSlugGroups: slugs.groups,
      duplicateSlugRecords: slugs.records,
      missingSkus: countStatus(products, (product) => !product.sourceSkuPresent),
      duplicateSkuGroups: skus.groups,
      duplicateSkuRecords: skus.records,
      sourceCaptureNotObserved: countStatus(products, (product) => product.sourceStatus !== "observed"),
      claimedSourceHashesMissingOrInvalid: countStatus(products, (product) => !product.claimedSourceSha256),
      sourceEvidenceReferencesMissing: countStatus(products, (product) => product.blockers.includes("source_evidence_reference_missing")),
      categoryAssignmentsNotApproved: countStatus(products, (product) => product.blockers.includes("category_assignment_not_approved")),
      productsWithSourceClaimConflicts: countStatus(products, (product) => product.blockers.includes("source_claim_conflicts")),
      productsWithResourceVerificationGaps: countStatus(products, (product) => product.resources.contentVerifiedFlags.false + product.resources.contentVerifiedFlags.unknown > 0),
      resources: products.reduce((sum, product) => sum + product.resources.count, 0),
      resourcesNeedingRelevanceReview: products.reduce((sum, product) => sum + (product.resources.relevance === "not_verified_by_preflight" ? product.resources.count : 0), 0),
      resourceContentVerifiedFlags: products.reduce((totals, product) => {
        for (const key of Object.keys(totals)) totals[key] += product.resources.contentVerifiedFlags[key];
        return totals;
      }, { true: 0, false: 0, unknown: 0 }),
      imageManifestsUnreadable: countStatus(products, (product) => product.imageManifest.state !== "readable"),
      archiveImageAssets: Object.values(processedStatusCounts).reduce((sum, count) => sum + count, 0),
      archiveImageProcessedStatusCounts: Object.fromEntries(Object.entries(processedStatusCounts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
      applicationCategoryMappings: 0,
      applicationVariantMappings: 0,
      applicationMediaMappings: 0,
      applicationMappingBlockedProducts: products.length,
      appShapeValid: shapeValid,
      appShapeInvalid: shapeInvalid,
      malformedRecords: countStatus(diagnostics, (diagnostic) => diagnostic.code === "invalid_product_json"),
      errors: countStatus(sortedDiagnostics, (diagnostic) => diagnostic.severity === "error"),
    },
    products: outputProducts,
    diagnostics: sortedDiagnostics,
  };
}

export function inspectSnapshot(snapshots, diagnostics = [], scanStats = {}) {
  const products = snapshots.map(({ record, archivePath, productJsonSha256, manifest }) => inspectProduct(record, archivePath, productJsonSha256, manifest));
  return buildReport(products, diagnostics, scanStats);
}

function scanProductJsonFiles(root, limits, diagnostics) {
  const files = [];
  let entriesScanned = 0;
  let maxDepthReached = 0;
  const visit = (directory, depth) => {
    maxDepthReached = Math.max(maxDepthReached, depth);
    const dir = fs.opendirSync(directory);
    const entries = [];
    try {
      let entry;
      while ((entry = dir.readSync()) !== null) {
        entriesScanned += 1;
        if (entriesScanned > limits.maxEntries) throw new Error("scan_limit_exceeded");
        entries.push(entry);
      }
    } finally {
      dir.closeSync();
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const rel = relativePath(root, entryPath);
      if (entry.isSymbolicLink()) {
        diagnostics.push({ severity: "error", path: rel, code: "symbolic_link_skipped" });
      } else if (entry.isDirectory()) {
        if (depth >= limits.maxDepth) throw new Error("depth_limit_exceeded");
        const canonical = fs.realpathSync(entryPath);
        if (!withinRoot(root, canonical)) throw new Error("path_outside_archive");
        visit(canonical, depth + 1);
      } else if (entry.isFile() && entry.name === "product.json") {
        const canonical = fs.realpathSync(entryPath);
        if (!withinRoot(root, canonical)) throw new Error("path_outside_archive");
        files.push({ path: canonical, archivePath: rel });
      } else if (!entry.isFile()) {
        diagnostics.push({ severity: "error", path: rel, code: "unsupported_filesystem_entry" });
      }
    }
  };

  try {
    visit(root, 0);
  } catch (error) {
    const code = error instanceof Error && ["scan_limit_exceeded", "depth_limit_exceeded", "path_outside_archive"].includes(error.message)
      ? error.message
      : "archive_scan_failed";
    diagnostics.push({ severity: "error", path: "", code });
  }
  return { files, entriesScanned, maxDepthReached };
}

export function inspectArchive(archiveRoot = DEFAULT_ARCHIVE_ROOT, overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) throw new TypeError("Invalid scan limits.");

  let canonicalRoot;
  try {
    const requestedRoot = path.resolve(archiveRoot);
    const rootStat = fs.lstatSync(requestedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return inspectSnapshot([], [{ severity: "error", path: "", code: "archive_root_unavailable" }]);
    canonicalRoot = fs.realpathSync(requestedRoot);
  } catch {
    return inspectSnapshot([], [{ severity: "error", path: "", code: "archive_root_unavailable" }]);
  }

  const diagnostics = [];
  const scan = scanProductJsonFiles(canonicalRoot, limits, diagnostics);
  const snapshots = [];
  for (const file of scan.files.sort((a, b) => a.archivePath < b.archivePath ? -1 : a.archivePath > b.archivePath ? 1 : 0)) {
    const parsed = readBoundedJson(file.path, canonicalRoot, limits.maxJsonBytes);
    if (!parsed.ok) {
      diagnostics.push({ severity: "error", path: file.archivePath, code: parsed.code === "invalid_json" ? "invalid_product_json" : parsed.code });
      continue;
    }

    const productDirectory = path.dirname(file.path);
    const manifest = summarizeManifest(parsed.value, productDirectory, limits.maxJsonBytes);
    if (manifest.state !== "readable") {
      diagnostics.push({ severity: "error", path: `${file.archivePath}#images.manifest`, code: manifest.state });
    }
    snapshots.push({ record: parsed.value, archivePath: file.archivePath, productJsonSha256: parsed.sha256, manifest });
  }

  return inspectSnapshot(snapshots, diagnostics, {
    productJsonFiles: scan.files.length,
    filesystemEntriesScanned: scan.entriesScanned,
    maximumDirectoryDepth: scan.maxDepthReached,
  });
}

export function exitCodeForReport(report) {
  return report.status === "error" ? 1 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = inspectArchive();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = exitCodeForReport(report);
}
