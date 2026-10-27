import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClerkClient } from "@clerk/backend";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://localhost:3000";
const projectId = "988b987b-f809-4cd5-94b2-c1d1e5cc9120";
const instanceId = "ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI";
const host = "https://r2g8wzib.us-east.insforge.app";
const work = path.join(root, ".bootstrap", "admin-price-followup");
const ledgerPath = path.join(work, "price-import-ledger.json");
const lockPath = path.join(work, "price-import.lock");
const ensure = (condition, label) => { if (!condition) throw new Error(label); };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isPaise = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000_000;
const isSku = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(value);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function moneyAmounts(text) {
  return [...String(text).matchAll(/₹([0-9,]+(?:\.\d{2})?)/g)].map((match) =>
    Math.round(Number(match[1].replaceAll(",", "")) * 100));
}

export function sourcePricePair(product) {
  const prices = product?.commercialObservations?.prices;
  const regular = Array.isArray(prices) ? prices.find((item) => item.field === "formattedPrice") : null;
  const actual = Array.isArray(prices) ? prices.find((item) => item.field === "formattedDiscountedPrice") : null;
  const listing = Array.isArray(prices) ? prices.find((item) => item.field === "listingPriceText") : null;
  ensure(regular?.currency === "INR" && isPaise(regular.paise) && typeof regular.text === "string", "source_regular_price_invalid");
  ensure(actual?.currency === "INR" && isPaise(actual.paise) && typeof actual.text === "string", "source_actual_price_invalid");
  ensure(actual.paise <= regular.paise && typeof listing?.text === "string", "source_price_pair_invalid");
  const listingAmounts = moneyAmounts(listing.text);
  ensure(listingAmounts.length === 1 || listingAmounts.length === 2, "source_listing_price_invalid");
  ensure(listingAmounts[0] === regular.paise, "source_listing_regular_price_mismatch");
  if (listingAmounts.length === 2) ensure(listingAmounts[1] === actual.paise, "source_listing_sale_price_mismatch");
  else ensure(actual.paise === regular.paise, "source_single_price_mismatch");
  return {
    regularPricePaise: regular.paise,
    actualPricePaise: actual.paise,
    regularText: regular.text,
    actualText: actual.text,
    listingPriceText: listing.text,
    discountedInSource: actual.paise !== regular.paise,
  };
}

export function classifyCurrentPrice(current, pair) {
  if (!isRecord(current) || !isPaise(pair?.regularPricePaise) || !isPaise(pair?.actualPricePaise)) return "conflict";
  const exact = current.regularPaise === pair.regularPricePaise && current.actualPaise === pair.actualPricePaise &&
    current.salePaise === null && current.saleFrom === null && current.saleUntil === null;
  if (exact) return "already-exact";
  const unpriced = current.regularPaise === null && current.actualPaise === null && current.salePaise === null &&
    current.saleFrom === null && current.saleUntil === null;
  return unpriced ? "ready-to-update" : "conflict";
}

export function matchesSourceAdminRecord(candidate, listItem, record, pricing) {
  const variants = record?.document?.variants;
  const source = record?.document?.sourceObservation;
  return isSku(candidate?.sku) && listItem?.slug === candidate.slug && listItem.sourceObservation === true &&
    listItem.status === "published" && record?.kind === "product" && record.slug === candidate.slug &&
    record.version === listItem.version &&
    record.archived === false && typeof record.id === "string" && Number.isSafeInteger(record.version) &&
    Boolean(record.publishedRevisionId) &&
    source?.sourceUrl === candidate.sourceUrl && Array.isArray(variants) && variants.length === 1 && variants[0].sku === candidate.sku &&
    pricing?.sourceObservation === true && Array.isArray(pricing.items) && pricing.items.length === 1 &&
    pricing.items[0].productId === record.id && pricing.items[0].sku === candidate.sku &&
    Number.isSafeInteger(pricing.items[0].priceVersion) && pricing.items[0].priceVersion >= 0 &&
    pricing.items[0].stock === null && pricing.items[0].stockVersion === null;
}

export function priceMutation(record, candidate, priceItem) {
  const pair = candidate.sourcePrice;
  return {
    expectedVersion: record.version,
    document: record.document,
    prices: [{
      sku: candidate.sku,
      expectedPriceVersion: priceItem.priceVersion,
      regularPricePaise: pair.regularPricePaise,
      actualPricePaise: pair.actualPricePaise,
      salePricePaise: null,
      saleStartsAt: null,
      saleEndsAt: null,
      reason: `Owner-approved source price import: ${candidate.transcript}#public-product-data sha256=${candidate.sourceRawSha256}`,
    }],
  };
}

export function isReviewOnlyPublicVariant(variant, sku, pair) {
  return isRecord(variant) && variant.sku === sku && isPaise(variant.regularPricePaise) &&
    isPaise(variant.effectivePricePaise) && variant.effectivePricePaise <= variant.regularPricePaise &&
    variant.isOnSale === (variant.effectivePricePaise < variant.regularPricePaise) && variant.saleEndsAt === null &&
    variant.availability === "unavailable" && variant.purchasable === false && variant.cartEligible === true &&
    !["stock", "stockVersion", "availableQuantity", "price", "salePrice", "quantity"].some((key) => key in variant) &&
    (!pair || (variant.regularPricePaise === pair.regularPricePaise && variant.effectivePricePaise === pair.actualPricePaise));
}

// Plan mode can inspect an unpriced source before importing its prices.
export function isUnpricedPublicVariant(variant, sku) {
  return isRecord(variant) && variant.sku === sku && variant.regularPricePaise === null &&
    variant.effectivePricePaise === null && variant.isOnSale === false && variant.saleEndsAt === null &&
    variant.availability === "unavailable" && variant.purchasable === false && variant.cartEligible !== true &&
    !["stock", "stockVersion", "availableQuantity", "price", "salePrice", "quantity"].some((key) => key in variant);
}

export function reconcilePendingPrices(ledger, inspected, verifiedAt) {
  let reconciled = 0;
  for (const { candidate, found } of inspected) {
    const row = ledger.items[candidate.sku];
    if (row?.status === "pending" && found.status === "already-exact") {
      ledger.items[candidate.sku] = { ...row, status: "verified-after-unknown-outcome", verifiedAt };
      reconciled++;
    }
  }
  return reconciled;
}

export async function mapBounded(items, concurrency, task, onProgress = () => {}) {
  ensure(Array.isArray(items) && Number.isSafeInteger(concurrency) && concurrency > 0 && concurrency <= 8 && typeof task === "function", "bounded_map_invalid");
  const results = [];
  let completed = 0;
  while (completed < items.length) {
    const batchSize = Math.min(concurrency, 10 - (completed % 10), items.length - completed);
    const batch = await Promise.all(items.slice(completed, completed + batchSize).map(task));
    results.push(...batch);
    completed += batch.length;
    if (completed % 10 === 0 || completed === items.length) onProgress(completed, items.length);
  }
  return results;
}

async function readJson(filePath, limit = 8 * 1024 * 1024) {
  const stats = await fs.lstat(filePath);
  ensure(stats.isFile() && !stats.isSymbolicLink() && stats.size <= limit, "source_file_invalid");
  return { bytes: await fs.readFile(filePath), stats };
}

function within(base, target) {
  const relative = path.relative(base, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readWithin(base, relativePath) {
  ensure(typeof relativePath === "string" && !relativePath.includes("\0") && !path.posix.isAbsolute(relativePath.replaceAll("\\", "/")), "source_path_invalid");
  const parts = relativePath.replaceAll("\\", "/").split("/");
  ensure(parts.every((part) => part && part !== "." && part !== ".." && !part.includes(":")), "source_path_invalid");
  const basePath = await fs.realpath(base);
  let target = basePath;
  for (let index = 0; index < parts.length; index++) {
    target = path.join(target, parts[index]);
    const stats = await fs.lstat(target);
    ensure(!stats.isSymbolicLink() && (index === parts.length - 1 ? stats.isFile() : stats.isDirectory()), "source_path_invalid");
  }
  const canonical = await fs.realpath(target);
  ensure(within(basePath, canonical), "source_path_outside_archive");
  const result = await readJson(canonical, 16 * 1024 * 1024);
  return { ...result, path: canonical };
}

function normalizedText(value) {
  return String(value).replaceAll("\\n", " ").replaceAll("\\", " ").replace(/\s+/g, " ").trim();
}

export async function sourceCandidates(repositoryRoot = root) {
  const catalogRead = await readJson(path.join(repositoryRoot, "products", "catalog.json"));
  const catalog = JSON.parse(catalogRead.bytes.toString("utf8"));
  ensure(Array.isArray(catalog.products) && catalog.products.length === 44, "source_catalog_count_changed");
  const seen = new Set();
  const candidates = [];
  const held = [];
  let listingObservationCount = 0;

  for (const entry of catalog.products) {
    ensure(isRecord(entry) && typeof entry.folder === "string" && typeof entry.sourceId === "string", "source_catalog_entry_invalid");
    const folderParts = entry.folder.replaceAll("\\", "/").split("/");
    ensure(folderParts.length === 2 && folderParts.every((part) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part)), "source_folder_invalid");
    const folder = folderParts.join("/");
    const productFile = await readWithin(path.join(repositoryRoot, "products"), `${folder}/product.json`);
    const product = JSON.parse(productFile.bytes.toString("utf8"));
    const slug = product.slug;
    ensure(typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && folderParts[1] === slug, "source_slug_mismatch");
    ensure(product.sourceId === entry.sourceId && product.identity?.title === entry.title && product.identity?.sku === entry.sku, "source_identity_mismatch");
    const expectedRawPath = `.firecrawl/product-archive/2026-10-25/pages/${slug}.json`;
    const rawRelative = String(product.source?.rawCacheReference ?? "").replaceAll("\\", "/");
    ensure(rawRelative === expectedRawPath && /^[a-f0-9]{64}$/.test(product.source?.rawSha256 ?? ""), "source_raw_reference_invalid");
    const rawFile = await readWithin(repositoryRoot, rawRelative);
    const rawSha256 = digest(rawFile.bytes);
    ensure(rawSha256 === product.source.rawSha256, "source_raw_hash_mismatch");
    const transcriptRelative = `${folder}/sources_links/source.md`;
    const transcriptFile = await readWithin(path.join(repositoryRoot, "products"), transcriptRelative);
    ensure(transcriptFile.bytes.toString("utf8").includes(`Raw capture SHA-256: ${rawSha256}`), "source_transcript_hash_mismatch");
    const sourceUrl = product.source?.url;
    let parsedUrl;
    try { parsedUrl = new URL(sourceUrl); } catch { throw new Error("source_url_invalid"); }
    ensure(parsedUrl.protocol === "https:" && parsedUrl.hostname === "www.pandabyte.in" &&
      parsedUrl.pathname === `/product-page/${slug}` && product.source?.resolvedUrl === sourceUrl &&
      product.source?.transcript === "sources_links/source.md", "source_url_invalid");
    const sourcePrice = sourcePricePair(product);
    const variants = product.variants?.items;
    ensure(Array.isArray(variants), "source_variants_invalid");
    const listingObservations = product.source?.discoveryEvidence?.listingObservations;
    ensure(Array.isArray(listingObservations) && listingObservations.length > 0, "source_listing_missing");
    const listingSources = [];
    for (const listing of listingObservations) {
      listingObservationCount++;
      ensure(isRecord(listing) && typeof listing.sourceFile === "string" && /^[a-z0-9-]+\.json$/.test(listing.sourceFile), "source_listing_reference_invalid");
      const relative = `.firecrawl/product-archive/2026-10-25/discovery/${listing.sourceFile}`;
      const capture = JSON.parse((await readWithin(repositoryRoot, relative)).bytes.toString("utf8"));
      const verified = normalizedText(capture.markdown).includes(normalizedText(listing.title)) &&
        normalizedText(capture.markdown).includes(normalizedText(listing.listingPriceText));
      ensure(verified, "source_listing_capture_mismatch");
      const amounts = moneyAmounts(listing.listingPriceText);
      ensure((amounts.length === 1 || amounts.length === 2) && amounts[0] === sourcePrice.regularPricePaise &&
        (amounts.length === 2 ? amounts[1] === sourcePrice.actualPricePaise : sourcePrice.actualPricePaise === sourcePrice.regularPricePaise), "source_listing_price_mismatch");
      listingSources.push({ sourceFile: relative, listingPriceText: listing.listingPriceText, verifiedAgainstCapturedMarkdown: true });
    }
    ensure(new Set(listingSources.map((listing) => listing.listingPriceText)).size === 1, "source_listing_prices_conflict");
    const sourceRawSha256 = product.source.rawSha256;
    const candidate = {
      sourceId: product.sourceId,
      slug,
      title: product.identity.title,
      sku: product.identity.sku || null,
      sourceUrl,
      sourceCapturedAt: product.source.capturedAt,
      captureTimeProvenance: product.source.captureTimeProvenance,
      sourceRawSha256,
      productJson: `products/${folder}/product.json`,
      transcript: `products/${transcriptRelative}`,
      transcriptEvidence: `products/${transcriptRelative}#public-product-data`,
      rawSnapshot: rawRelative,
      listingSources,
      sourcePrice,
      sourceVariantCount: variants.length,
    };
    if (candidate.sku === null) {
      held.push({ slug, title: candidate.title, reason: "missing-source-sku" });
      continue;
    }
    ensure(isSku(candidate.sku) && !seen.has(candidate.sku), "source_sku_invalid_or_duplicate");
    seen.add(candidate.sku);
    ensure(variants.length === 1 && variants[0].sku === candidate.sku &&
      Number.isSafeInteger(variants[0].price) && variants[0].price * 100 === sourcePrice.regularPricePaise, "source_variant_price_mismatch");
    if (sourcePrice.discountedInSource) ensure(variants[0].comparePrice * 100 === sourcePrice.actualPricePaise, "source_variant_sale_mismatch");
    candidates.push(candidate);
  }
  ensure(candidates.length === 42 && held.length === 2, "source_candidate_count_changed");
  return { candidates, held, sourceProductCount: catalog.products.length, listingObservationCount };
}

function priceStats(candidates, key) {
  const values = candidates.map((candidate) => candidate.sourcePrice[key]);
  const sum = values.reduce((total, value) => total + value, 0);
  return { count: values.length, minPaise: Math.min(...values), meanPaise: Math.round(sum / values.length), maxPaise: Math.max(...values) };
}

function priceState(item) {
  return { regularPaise: item.regularPaise, actualPaise: item.actualPaise, salePaise: item.salePaise, saleFrom: item.saleFrom, saleUntil: item.saleUntil };
}

async function setupAdminClient() {
  const config = JSON.parse((await readJson(path.join(root, ".insforge", "project.json"))).bytes.toString("utf8"));
  ensure(config.project_id === projectId && config.oss_host === host && process.env.NEXT_PUBLIC_INSFORGE_BASE_URL === host &&
    process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "development_target_mismatch");
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  ensure((await clerk.instance.get()).id === instanceId, "development_identity_mismatch");
  const owner = JSON.parse((await readJson(path.join(root, ".bootstrap", "owner-admin-subject.json"))).bytes.toString("utf8"));
  ensure(typeof owner.userId === "string", "owner_identity_missing");
  const sessions = await clerk.sessions.getSessionList({ userId: owner.userId, status: "active", limit: 20 });
  ensure(Array.isArray(sessions.data) && sessions.data.length > 0, "owner_active_session_required");
  const session = sessions.data.sort((a, b) => Number(b.lastActiveAt) - Number(a.lastActiveAt))[0];
  let cachedToken;
  let mintedAt = 0;
  const api = async (url, body) => {
    if (!cachedToken || Date.now() - mintedAt > 25_000) {
      cachedToken = (await clerk.sessions.getToken(session.id)).jwt;
      mintedAt = Date.now();
    }
    const response = await fetch(`${origin}${url}`, {
      method: body ? "PATCH" : "GET",
      headers: { authorization: `Bearer ${cachedToken}`, origin, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    ensure(response.ok, `admin_request_${response.status}`);
    try { return await response.json(); } catch { throw new Error("admin_response_invalid"); }
  };
  const publicApi = async (url) => {
    const response = await fetch(`${origin}${url}`, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
    ensure(response.ok, `public_request_${response.status}`);
    try { return await response.json(); } catch { throw new Error("public_response_invalid"); }
  };
  const access = await api("/api/admin/access");
  ensure(Array.isArray(access.capabilities) && access.capabilities.includes("catalog.edit"), "owner_catalog_capability_required");
  const roles = await api("/api/admin/roles?limit=50&offset=0");
  ensure(Array.isArray(roles.items) && roles.items.some((row) => row.userId === owner.userId && row.role === "ADMIN" && row.protected), "protected_owner_required");
  return { api, publicApi };
}

async function findAdminRecord(api, candidate) {
  const query = `/api/admin/products/table?q=${encodeURIComponent(candidate.slug)}&status=all&limit=10&offset=0`;
  const listing = await api(query);
  ensure(Array.isArray(listing.items) && listing.items.length <= 10 && Number.isSafeInteger(listing.total) && listing.total >= listing.items.length, "admin_product_list_invalid");
  ensure(listing.total <= 10, "admin_product_search_unbounded");
  const matches = listing.items.filter((row) => row.slug === candidate.slug);
  if (matches.length === 0) return { status: "missing-admin-record" };
  if (matches.length !== 1) return { status: "ambiguous-admin-record" };
  const listItem = matches[0];
  if (typeof listItem.id !== "string") return { status: "invalid-admin-record" };
  const response = await api(`/api/admin/products/${encodeURIComponent(listItem.id)}`);
  const record = response.record;
  const pricing = await api(`/api/admin/products/${encodeURIComponent(listItem.id)}/pricing`);
  if (!matchesSourceAdminRecord(candidate, listItem, record, pricing)) return { status: "source-admin-match-required" };
  const priceItem = pricing.items[0];
  return { status: classifyCurrentPrice(priceState(priceItem), candidate.sourcePrice), listItem, record, pricing, priceItem };
}

async function checkPublicVariant(publicApi, candidate, found, allowUnpriced) {
  const valid = (variant) => isReviewOnlyPublicVariant(variant, candidate.sku, found.status === "already-exact" ? candidate.sourcePrice : undefined) ||
    (allowUnpriced && found.status === "ready-to-update" && isUnpricedPublicVariant(variant, candidate.sku));
  const detail = await publicApi(`/api/published/products/${encodeURIComponent(candidate.slug)}`);
  const record = detail.record;
  const observation = record?.document?.sourceObservation;
  const variant = record?.variants?.find((item) => item.sku === candidate.sku);
  ensure(record?.slug === candidate.slug && observation?.sourceUrl === candidate.sourceUrl &&
    record.variants?.length === 1 && valid(variant), "public_product_price_contract_failed");
  const catalog = await publicApi(`/api/catalog?q=${encodeURIComponent(candidate.sku)}&limit=48`);
  const item = Array.isArray(catalog.items) ? catalog.items.find((entry) => entry.slug === candidate.slug) : null;
  const catalogVariant = item?.variants?.find((entry) => entry.sku === candidate.sku);
  ensure(item?.document?.sourceObservation?.sourceUrl === candidate.sourceUrl && item.variants?.length === 1 &&
    valid(catalogVariant), "public_catalog_price_contract_failed");
}

async function inspectAll(adminApi, publicApi, candidates, progressLabel, allowUnpriced = false) {
  return mapBounded(candidates, 3, async (candidate) => {
    const found = await findAdminRecord(adminApi, candidate);
    const row = {
      sku: candidate.sku,
      slug: candidate.slug,
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      sourceCapturedAt: candidate.sourceCapturedAt,
      captureTimeProvenance: candidate.captureTimeProvenance,
      sourceRawSha256: candidate.sourceRawSha256,
      productJson: candidate.productJson,
      transcriptEvidence: candidate.transcriptEvidence,
      rawSnapshot: candidate.rawSnapshot,
      listingSources: candidate.listingSources,
      regularPricePaise: candidate.sourcePrice.regularPricePaise,
      actualPricePaise: candidate.sourcePrice.actualPricePaise,
      regularText: candidate.sourcePrice.regularText,
      actualText: candidate.sourcePrice.actualText,
      listingPriceText: candidate.sourcePrice.listingPriceText,
      discountedInSource: candidate.sourcePrice.discountedInSource,
      status: found.status,
    };
    if (found.record) {
      row.expectedVersion = found.record.version;
      row.expectedPriceVersion = found.priceItem.priceVersion;
      if (found.status === "conflict") row.currentPricePaise = priceState(found.priceItem);
    }
    if (found.record && found.status !== "source-admin-match-required") await checkPublicVariant(publicApi, candidate, found, allowUnpriced);
    return { candidate, found, report: row };
  }, (completed, total) => console.log(`${progressLabel} ${completed}/${total}`));
}

function makeReport(mode, source, inspected) {
  const byStatus = Object.fromEntries(["already-exact", "ready-to-update", "conflict", "missing-admin-record", "ambiguous-admin-record", "source-admin-match-required", "invalid-admin-record"].map((status) =>
    [status, inspected.filter(({ found }) => found.status === status).length]));
  return {
    scope: "verified-local-development-only",
    mode,
    sourceProducts: source.sourceProductCount,
    skuCandidates: source.candidates.length,
    heldMissingSku: source.held.length,
    listingObservationsVerified: source.listingObservationCount,
    sourcePriceStats: {
      regularPricePaise: priceStats(source.candidates, "regularPricePaise"),
      actualPricePaise: priceStats(source.candidates, "actualPricePaise"),
    },
    dispositions: byStatus,
    held: source.held,
    entries: inspected.map(({ report }) => report),
  };
}

function conciseReport(reportPath, report) {
  return {
    reportPath: path.relative(root, reportPath),
    mode: report.mode,
    scope: report.scope,
    sourceProducts: report.sourceProducts,
    skuCandidates: report.skuCandidates,
    heldMissingSku: report.heldMissingSku,
    listingObservationsVerified: report.listingObservationsVerified,
    sourcePriceStats: report.sourcePriceStats,
    dispositions: report.dispositions,
    held: report.held,
  };
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  const handle = await fs.open(tempPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  await fs.rename(tempPath, filePath);
}

async function readLedger(source, { allowPending = false } = {}) {
  try {
    const ledger = JSON.parse((await readJson(ledgerPath, 2 * 1024 * 1024)).bytes.toString("utf8"));
    ensure(ledger.schemaVersion === 1 && ledger.projectId === projectId && isRecord(ledger.items), "price_ledger_invalid");
    ensure(ledger.sourceFingerprint === source.fingerprint, "price_ledger_source_changed");
    if (!allowPending) ensure(!Object.values(ledger.items).some((row) => row?.status === "pending"), "price_import_pending_requires_verify");
    return ledger;
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, projectId, sourceFingerprint: source.fingerprint, items: {} };
    throw error;
  }
}

function fingerprintCandidates(candidates) {
  return digest(Buffer.from(JSON.stringify(candidates.map((candidate) => ({
    sourceId: candidate.sourceId,
    slug: candidate.slug,
    sku: candidate.sku,
    sourceUrl: candidate.sourceUrl,
    sourceRawSha256: candidate.sourceRawSha256,
    regularPricePaise: candidate.sourcePrice.regularPricePaise,
    actualPricePaise: candidate.sourcePrice.actualPricePaise,
  })))));
}

async function verifyAfterWrite(adminApi, candidate, before) {
  const recordResponse = await adminApi(`/api/admin/products/${encodeURIComponent(before.record.id)}`);
  const afterRecord = recordResponse.record;
  ensure(afterRecord?.slug === candidate.slug && afterRecord.document?.sourceObservation?.sourceUrl === candidate.sourceUrl &&
    stable(afterRecord.document) && JSON.stringify(stable(afterRecord.document)) === JSON.stringify(stable(before.record.document)) &&
    afterRecord.publishedRevisionId === before.record.publishedRevisionId && afterRecord.version > before.record.version, "price_write_changed_product_document");
  const priceResponse = await adminApi(`/api/admin/products/${encodeURIComponent(before.record.id)}/pricing`);
  const priceItem = priceResponse.items?.find((item) => item.sku === candidate.sku);
  ensure(priceResponse.sourceObservation === true && priceResponse.items?.length === 1 && priceItem &&
    classifyCurrentPrice(priceState(priceItem), candidate.sourcePrice) === "already-exact" &&
    priceItem.priceVersion > before.priceItem.priceVersion && priceItem.stock === null && priceItem.stockVersion === null, "price_write_verification_failed");
}

async function main() {
  const args = process.argv.slice(2);
  ensure(args.length === 1 && ["--plan", "--apply", "--verify"].includes(args[0]), "use_plan_apply_or_verify");
  const mode = args[0].slice(2);
  const source = await sourceCandidates();
  source.fingerprint = fingerprintCandidates(source.candidates);
  const { api, publicApi } = await setupAdminClient();
  await fs.mkdir(work, { recursive: true });
  const lock = mode === "plan" ? null : await fs.open(lockPath, "wx");
  try {
    const inspected = await inspectAll(api, publicApi, source.candidates, `Price ${mode} preflight`, mode === "plan");
    const report = makeReport(mode, source, inspected);
    const reportPath = path.join(work, `price-import-${mode === "plan" ? "plan" : mode === "apply" ? "apply" : "verify"}-report.json`);
    await writeJsonAtomic(reportPath, report);

    const blockers = inspected.filter(({ found }) => !["already-exact", "ready-to-update"].includes(found.status));
    if (mode === "plan") {
      console.log(JSON.stringify(conciseReport(reportPath, report)));
      ensure(blockers.length === 0, "price_import_plan_blocked");
      return;
    }

    if (mode === "verify") {
      const pending = await readLedger(source, { allowPending: true });
      const reconciled = reconcilePendingPrices(pending, inspected, new Date().toISOString());
      if (reconciled) await writeJsonAtomic(ledgerPath, pending);
      if (blockers.length || inspected.some(({ found }) => found.status !== "already-exact")) throw new Error("price_import_verification_incomplete");
      console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), verified: inspected.length, held: source.held.length }));
      return;
    }

    const ledger = await readLedger(source);
    ensure(blockers.length === 0, "price_import_plan_blocked");
    for (const { candidate, found } of inspected) {
      const prior = ledger.items[candidate.sku];
      if (prior) ensure(prior.slug === candidate.slug && prior.sourceRawSha256 === candidate.sourceRawSha256 &&
        prior.regularPricePaise === candidate.sourcePrice.regularPricePaise && prior.actualPricePaise === candidate.sourcePrice.actualPricePaise, "price_ledger_item_changed");
      if (["already-exact", "complete", "verified-after-unknown-outcome"].includes(prior?.status)) {
        ensure(found.status === "already-exact", "price_ledger_existing_price_changed");
      }
    }
    for (const { candidate, found, report: entryReport } of inspected) {
      const prior = ledger.items[candidate.sku];
      if (found.status === "already-exact") {
        ledger.items[candidate.sku] = { slug: candidate.slug, sku: candidate.sku, sourceRawSha256: candidate.sourceRawSha256,
          regularPricePaise: candidate.sourcePrice.regularPricePaise, actualPricePaise: candidate.sourcePrice.actualPricePaise,
          expectedPriceVersion: found.priceItem.priceVersion,
          status: ["complete", "verified-after-unknown-outcome"].includes(prior?.status) ? prior.status : "already-exact",
          ...(prior?.updatedAt ? { updatedAt: prior.updatedAt } : {}) };
        entryReport.outcome = "skipped-already-exact";
        await writeJsonAtomic(ledgerPath, ledger);
        continue;
      }
      const mutation = priceMutation(found.record, candidate, found.priceItem);
      ledger.items[candidate.sku] = { slug: candidate.slug, sku: candidate.sku, sourceRawSha256: candidate.sourceRawSha256,
        regularPricePaise: candidate.sourcePrice.regularPricePaise, actualPricePaise: candidate.sourcePrice.actualPricePaise,
        expectedRecordVersion: found.record.version, expectedPriceVersion: found.priceItem.priceVersion, status: "pending" };
      await writeJsonAtomic(ledgerPath, ledger);
      const response = await api(`/api/admin/products/${encodeURIComponent(found.record.id)}`, mutation);
      ensure(response.record?.slug === candidate.slug, "price_write_record_response_invalid");
      await verifyAfterWrite(api, candidate, found);
      ledger.items[candidate.sku].status = "complete";
      ledger.items[candidate.sku].updatedAt = new Date().toISOString();
      entryReport.outcome = "updated-and-verified";
      await writeJsonAtomic(ledgerPath, ledger);
    }
    const finalInspection = await inspectAll(api, publicApi, source.candidates, "Price final verify");
    ensure(finalInspection.every(({ found }) => found.status === "already-exact"), "price_import_final_verification_failed");
    const finalReport = { ...report, mode: "apply", applied: true, verifiedPrices: inspected.length,
      updated: inspected.filter(({ found }) => found.status === "ready-to-update").length,
      skippedExact: inspected.filter(({ found }) => found.status === "already-exact").length };
    await writeJsonAtomic(reportPath, finalReport);
    console.log(JSON.stringify({ reportPath: path.relative(root, reportPath), applied: true, verifiedPrices: inspected.length,
      updated: finalReport.updated, skippedExact: finalReport.skippedExact, held: source.held.length }));
  } finally {
    if (lock) {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) {
  main().catch((error) => {
    const message = typeof error?.message === "string" && /^[a-z0-9_]+$/.test(error.message) ? error.message : "price_import_stopped_safely";
    console.error(message);
    process.exitCode = 1;
  });
}
