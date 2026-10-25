export const ADMIN_MODULES = {
  products: { kind: "product", editCapability: "catalog.edit" },
  categories: { kind: "category", editCapability: "catalog.edit" },
  blog: { kind: "blog", editCapability: "content.edit" },
  pages: { kind: "page", editCapability: "content.edit" },
  faqs: { kind: "faq", editCapability: "content.edit" },
  team: { kind: "team", editCapability: "content.edit" },
  navigation: { kind: "navigation", editCapability: "content.edit" },
  contact: { kind: "contact", editCapability: "content.edit" },
  solutions: { kind: "solution", editCapability: "content.edit" },
  learn: { kind: "resource", editCapability: "content.edit" },
  videos: { kind: "video", editCapability: "content.edit" },
} as const;

export type AdminModule = keyof typeof ADMIN_MODULES;
export type CmsKind = (typeof ADMIN_MODULES)[AdminModule]["kind"];
export type CommonDocument = {
  title: string;
  slug: string;
  summary: string;
  blocks: ContentBlock[];
  seoTitle: string;
  seoDescription: string;
};

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "bulletList" | "orderedList"; items: string[] }
  | { type: "link"; label: string; url: string }
  | { type: "image"; mediaId: string; alt: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type DocumentLink = { label: string; url: string };
export type SourceObservation = { priceText: string; capturedAt: string; sourceUrl: string };
export type AdminDocumentByModule = {
  products: CommonDocument & {
    categoryIds: string[];
    modelNumbers: string[];
    variants: { id?: string; sku: string; label: string }[];
    specifications: { name: string; value: string }[];
    compatibility: string[];
    kitContents: { productId?: string; title: string; quantity: number }[];
    resources: DocumentLink[];
    mediaIds: string[];
    sourceObservation?: SourceObservation;
    sourceReview?: string[];
  };
  categories: CommonDocument & { parentId: string | null; position: number; mediaIds: string[] };
  blog: CommonDocument & { author: string; tags: string[]; mediaIds: string[] };
  pages: CommonDocument;
  faqs: CommonDocument & { answer: string; topic: string; placements: string[]; position: number };
  team: CommonDocument & { name: string; role: string; bio: string; mediaIds: string[]; links: DocumentLink[]; position: number };
  navigation: CommonDocument & { links: { label: string; href: string; group: "header" | "footer"; position: number; visible: boolean }[] };
  contact: CommonDocument & { email: string; phone: string; address: string; hours: string; timezone: string; socialLinks: DocumentLink[]; supportTitle?: string; supportText?: string; footerTagline?: string; copyrightName?: string };
  solutions: CommonDocument;
  learn: CommonDocument & { url: string; productIds: string[]; position: number; collection: "product-specs" | "embedded-systems" | "kit-guides" };
  videos: CommonDocument & { url: string; productIds: string[]; position: number };
};
export type AdminDocument<M extends AdminModule = AdminModule> = AdminDocumentByModule[M];

export type FieldError = { field: string; code: "required" | "invalid" | "unknown_field"; message: string };
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; fields: FieldError[] };

export const MAX_ADMIN_BODY_BYTES = 256 * 1024;
export const MAX_ADMIN_PAGE_SIZE = 100;
const DEFAULT_ADMIN_PAGE_SIZE = 24;
const MAX_ADMIN_OFFSET = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const COMMON_FIELDS = ["title", "slug", "summary", "blocks", "seoTitle", "seoDescription"] as const;

const MODULE_FIELDS: Record<AdminModule, readonly string[]> = {
  products: ["categoryIds", "modelNumbers", "variants", "specifications", "compatibility", "kitContents", "resources", "mediaIds", "sourceObservation", "sourceReview"],
  categories: ["parentId", "position", "mediaIds"],
  blog: ["author", "tags", "mediaIds"],
  pages: [],
  faqs: ["answer", "topic", "placements", "position"],
  team: ["name", "role", "bio", "mediaIds", "links", "position"],
  navigation: ["links"],
  contact: ["email", "phone", "address", "hours", "timezone", "socialLinks", "supportTitle", "supportText", "footerTagline", "copyrightName"],
  solutions: [],
  learn: ["url", "productIds", "position", "collection"],
  videos: ["url", "productIds", "position"],
};

type ObjectValue = Record<string, unknown>;

function isObject(value: unknown): value is ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: ObjectValue, allowed: readonly string[], path: string, fields: FieldError[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fields.push({ field: path ? `${path}.${key}` : key, code: "unknown_field", message: "This field is not allowed." });
  }
}

function add(fields: FieldError[], field: string, code: FieldError["code"], message: string) {
  fields.push({ field, code, message });
}

function textValue(
  object: ObjectValue,
  key: string,
  path: string,
  fields: FieldError[],
  max: number,
  options: { required?: boolean; nonEmpty?: boolean } = {},
): string | undefined {
  const value = object[key];
  if (value === undefined && !options.required) return "";
  if (typeof value !== "string") {
    add(fields, path, options.required ? "required" : "invalid", options.required ? "A value is required." : "Enter text.");
    return undefined;
  }
  const normalized = value.trim();
  if (Array.from(normalized).length > max || CONTROL_CHARS.test(normalized) || (options.nonEmpty && !normalized)) {
    add(fields, path, "invalid", options.nonEmpty && !normalized ? "Enter a value." : `Use at most ${max} characters.`);
    return undefined;
  }
  return normalized;
}

function integerValue(value: unknown, field: string, fields: FieldError[], min = 0, max = 1_000_000): number | undefined {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    add(fields, field, "invalid", `Enter a whole number from ${min} to ${max}.`);
    return undefined;
  }
  return value as number;
}

function uuidValue(value: unknown, field: string, fields: FieldError[], nullable = false): string | null | undefined {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !UUID.test(value)) {
    add(fields, field, "invalid", "Choose a valid record.");
    return undefined;
  }
  return value.toLowerCase();
}

function safeHref(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//") && !value.includes("\\") && !CONTROL_CHARS.test(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !CONTROL_CHARS.test(value);
  } catch {
    return false;
  }
}

function youtubeId(value: string): string | null {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      const id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)\/?$/)?.[1];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {
    return null;
  }
  return null;
}

function textArray(value: unknown, field: string, fields: FieldError[], maxItems: number, maxText: number): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    add(fields, field, "invalid", `Use a list with at most ${maxItems} entries.`);
    return undefined;
  }
  const output: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      add(fields, `${field}.${index}`, "invalid", "Enter text.");
      return;
    }
    const normalized = item.trim();
    if (!normalized || Array.from(normalized).length > maxText || CONTROL_CHARS.test(normalized)) {
      add(fields, `${field}.${index}`, "invalid", `Use 1 to ${maxText} characters.`);
      return;
    }
    output.push(normalized);
  });
  return output.length === value.length ? output : undefined;
}

function uuidArray(value: unknown, field: string, fields: FieldError[], maxItems = 100): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    add(fields, field, "invalid", `Use a list with at most ${maxItems} entries.`);
    return undefined;
  }
  const ids = value.map((item, index) => uuidValue(item, `${field}.${index}`, fields));
  if (new Set(ids).size !== ids.length) add(fields, field, "invalid", "Remove duplicate records.");
  return ids.every((id): id is string => typeof id === "string") ? ids : undefined;
}

function objectArray<T>(
  value: unknown,
  field: string,
  fields: FieldError[],
  maxItems: number,
  parseItem: (item: ObjectValue, path: string, errors: FieldError[]) => T | undefined,
): T[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    add(fields, field, "invalid", `Use a list with at most ${maxItems} entries.`);
    return undefined;
  }
  const output: T[] = [];
  value.forEach((item, index) => {
    const path = `${field}.${index}`;
    if (!isObject(item)) {
      add(fields, path, "invalid", "Enter a valid item.");
      return;
    }
    const parsed = parseItem(item, path, fields);
    if (parsed !== undefined) output.push(parsed);
  });
  return output.length === value.length ? output : undefined;
}

function parseLinks(value: unknown, field: string, fields: FieldError[], maxItems = 30) {
  return objectArray(value, field, fields, maxItems, (item, path, errors) => {
    hasOnlyKeys(item, ["label", "url"], path, errors);
    const label = textValue(item, "label", `${path}.label`, errors, 120, { required: true, nonEmpty: true });
    const url = textValue(item, "url", `${path}.url`, errors, 2048, { required: true, nonEmpty: true });
    if (url && !safeHref(url)) add(errors, `${path}.url`, "invalid", "Use an internal path or HTTPS link.");
    return label !== undefined && url !== undefined && safeHref(url) ? { label, url } : undefined;
  });
}

function parseBlocks(value: unknown, fields: FieldError[]): ContentBlock[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) {
    add(fields, "blocks", "invalid", "Use at most 100 content blocks.");
    return undefined;
  }
  const output: ContentBlock[] = [];
  value.forEach((block, index) => {
    const path = `blocks.${index}`;
    if (!isObject(block) || typeof block.type !== "string") {
      add(fields, path, "invalid", "Choose a supported content block.");
      return;
    }
    const type = block.type;
    const parseText = (key: string, max: number, required = true) => textValue(block, key, `${path}.${key}`, fields, max, { required, nonEmpty: required });
    if (type === "paragraph" || type === "heading") {
      hasOnlyKeys(block, type === "heading" ? ["type", "level", "text"] : ["type", "text"], path, fields);
      const text = parseText("text", 8000);
      if (type === "paragraph" && text !== undefined) output.push({ type, text });
      else if (type === "heading") {
        const level = block.level;
        if (level !== 1 && level !== 2 && level !== 3) add(fields, `${path}.level`, "invalid", "Use heading level 1, 2, or 3.");
        else if (text !== undefined) output.push({ type, level, text });
      }
      return;
    }
    if (type === "code") {
      hasOnlyKeys(block, ["type", "language", "code"], path, fields);
      const language = parseText("language", 40, false) ?? "";
      const code = parseText("code", 12_000);
      if (code !== undefined) output.push({ type, language, code });
      return;
    }
    if (type === "bulletList" || type === "orderedList") {
      hasOnlyKeys(block, ["type", "items"], path, fields);
      const items = textArray(block.items, `${path}.items`, fields, 50, 1000);
      if (!items || items.length === 0) add(fields, `${path}.items`, "invalid", "Add at least one list item.");
      else output.push({ type, items });
      return;
    }
    if (type === "link") {
      hasOnlyKeys(block, ["type", "label", "url"], path, fields);
      const label = parseText("label", 120);
      const url = parseText("url", 2048);
      if (url && !safeHref(url)) add(fields, `${path}.url`, "invalid", "Use an internal path or HTTPS link.");
      if (label !== undefined && url !== undefined && safeHref(url)) output.push({ type, label, url });
      return;
    }
    if (type === "image") {
      hasOnlyKeys(block, ["type", "mediaId", "alt"], path, fields);
      const mediaId = uuidValue(block.mediaId, `${path}.mediaId`, fields);
      const alt = parseText("alt", 240);
      if (mediaId && alt !== undefined) output.push({ type, mediaId, alt });
      return;
    }
    if (type === "table") {
      hasOnlyKeys(block, ["type", "headers", "rows"], path, fields);
      const headers = textArray(block.headers, `${path}.headers`, fields, 12, 120);
      if (!Array.isArray(block.rows) || block.rows.length > 40 || (headers && block.rows.some((row) => !Array.isArray(row) || row.length !== headers.length))) {
        add(fields, `${path}.rows`, "invalid", "Use at most 40 rows with the same columns as the header.");
        return;
      }
      const rows: string[][] = [];
      block.rows.forEach((row, rowIndex) => {
        const parsed = textArray(row, `${path}.rows.${rowIndex}`, fields, 12, 500);
        if (parsed) rows.push(parsed);
      });
      if (!headers || headers.length === 0) add(fields, `${path}.headers`, "invalid", "Add at least one table column.");
      else if (rows.length === block.rows.length) output.push({ type, headers, rows });
      return;
    }
    add(fields, `${path}.type`, "invalid", "This content block type is not supported.");
  });
  return output.length === value.length ? output : undefined;
}

function parseVariantRows(value: unknown, fields: FieldError[]) {
  const variants = objectArray(value, "variants", fields, 100, (item, path, errors) => {
    hasOnlyKeys(item, ["id", "sku", "label"], path, errors);
    const id = item.id === undefined ? undefined : uuidValue(item.id, `${path}.id`, errors);
    const sku = textValue(item, "sku", `${path}.sku`, errors, 80, { required: true, nonEmpty: true });
    const label = textValue(item, "label", `${path}.label`, errors, 120, { required: true, nonEmpty: true });
    return (item.id === undefined || id) && sku !== undefined && label !== undefined
      ? { ...(id ? { id } : {}), sku, label }
      : undefined;
  });
  if (variants) {
    const skus = variants.map((variant) => variant.sku.toLocaleLowerCase("en-US"));
    if (new Set(skus).size !== skus.length) add(fields, "variants", "invalid", "Each SKU must be unique within this product.");
  }
  return variants;
}

function parseSourceObservation(value: unknown, fields: FieldError[]): SourceObservation | undefined {
  if (!isObject(value)) {
    add(fields, "document.sourceObservation", "invalid", "Enter a source observation.");
    return undefined;
  }
  hasOnlyKeys(value, ["priceText", "capturedAt", "sourceUrl"], "document.sourceObservation", fields);
  const isoDateTime = (value: unknown): value is string => {
    if (typeof value !== "string" || value.startsWith("0000") || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const local = value.slice(0, 19);
    return new Date(`${local}Z`).toISOString().slice(0, 19) === local;
  };
  const priceText = value.priceText;
  const validPriceText = typeof priceText === "string" && Array.from(priceText).length <= 160 && !/[\u0000-\u001f\u007f]/.test(priceText);
  if (!validPriceText) {
    add(fields, "document.sourceObservation.priceText", "invalid", "Use at most 160 characters without control characters.");
  }
  const capturedAt = value.capturedAt;
  const validCapturedAt = isoDateTime(capturedAt);
  if (!validCapturedAt) {
    add(fields, "document.sourceObservation.capturedAt", "invalid", "Enter a valid ISO date and time with a timezone.");
  }
  const sourceUrl = value.sourceUrl;
  let safeSourceUrl = false;
  if (typeof sourceUrl === "string" && sourceUrl.length <= 2048 && sourceUrl.startsWith("https://") && !/[\\\s\u0000-\u001f\u007f]/.test(sourceUrl)) {
    try {
      const parsed = new URL(sourceUrl);
      safeSourceUrl = parsed.protocol === "https:" && !!parsed.hostname && !parsed.username && !parsed.password;
    } catch { /* invalid URL */ }
  }
  if (!safeSourceUrl) add(fields, "document.sourceObservation.sourceUrl", "invalid", "Use an HTTPS source URL without credentials.");
  return validPriceText && validCapturedAt && safeSourceUrl
    ? { priceText: priceText as string, capturedAt: capturedAt as string, sourceUrl: sourceUrl as string }
    : undefined;
}

function parseSpecifications(value: unknown, fields: FieldError[]) {
  return objectArray(value, "specifications", fields, 100, (item, path, errors) => {
    hasOnlyKeys(item, ["name", "value"], path, errors);
    const name = textValue(item, "name", `${path}.name`, errors, 120, { required: true, nonEmpty: true });
    const specValue = textValue(item, "value", `${path}.value`, errors, 2000, { required: true, nonEmpty: true });
    return name !== undefined && specValue !== undefined ? { name, value: specValue } : undefined;
  });
}

function parseKitContents(value: unknown, fields: FieldError[]) {
  return objectArray(value, "kitContents", fields, 100, (item, path, errors) => {
    hasOnlyKeys(item, ["productId", "title", "quantity"], path, errors);
    const productId = item.productId === undefined ? undefined : uuidValue(item.productId, `${path}.productId`, errors);
    const title = textValue(item, "title", `${path}.title`, errors, 160, { required: true, nonEmpty: true });
    const quantity = integerValue(item.quantity, `${path}.quantity`, errors, 1, 10_000);
    return (item.productId === undefined || productId) && title !== undefined && quantity !== undefined
      ? { ...(productId ? { productId } : {}), title, quantity }
      : undefined;
  });
}

function parseResourceLinks(value: unknown, fields: FieldError[]) {
  return objectArray(value, "resources", fields, 100, (item, path, errors) => {
    hasOnlyKeys(item, ["label", "url"], path, errors);
    const label = textValue(item, "label", `${path}.label`, errors, 160, { required: true, nonEmpty: true });
    const url = textValue(item, "url", `${path}.url`, errors, 2048, { required: true, nonEmpty: true });
    if (url && !safeHref(url)) add(errors, `${path}.url`, "invalid", "Use an internal path or HTTPS link.");
    return label !== undefined && url !== undefined && safeHref(url) ? { label, url } : undefined;
  });
}

function parseNavigationLinks(value: unknown, fields: FieldError[]) {
  const links = objectArray(value, "links", fields, 100, (item, path, errors) => {
    hasOnlyKeys(item, ["label", "href", "group", "position", "visible"], path, errors);
    const label = textValue(item, "label", `${path}.label`, errors, 120, { required: true, nonEmpty: true });
    const href = textValue(item, "href", `${path}.href`, errors, 2048, { required: true, nonEmpty: true });
    const group = item.group;
    if (group !== "header" && group !== "footer") add(errors, `${path}.group`, "invalid", "Choose header or footer.");
    const position = integerValue(item.position, `${path}.position`, errors);
    if (typeof item.visible !== "boolean") add(errors, `${path}.visible`, "invalid", "Choose whether this link is visible.");
    if (href && !safeHref(href)) add(errors, `${path}.href`, "invalid", "Use an internal path or HTTPS link.");
    return label !== undefined && href !== undefined && safeHref(href) && (group === "header" || group === "footer") && position !== undefined && typeof item.visible === "boolean"
      ? { label, href, group, position, visible: item.visible }
      : undefined;
  });
  const targets = (links ?? []).map((link) => `${link.group}:${link.href}`);
  if (new Set(targets).size !== targets.length) add(fields, "document.links", "invalid", "Use one link per destination in each location.");
  return links;
}

function parsePosition(object: ObjectValue, fields: FieldError[]) {
  return object.position === undefined ? 0 : integerValue(object.position, "position", fields);
}

export function parseAdminModule(value: string): AdminModule | null {
  return Object.prototype.hasOwnProperty.call(ADMIN_MODULES, value) ? value as AdminModule : null;
}

export function parseRecordId(value: string): string | null {
  return UUID.test(value) ? value.toLowerCase() : null;
}

export function parseSlug(value: string): string | null {
  return value.length <= 160 && SLUG.test(value) ? value : null;
}

export function parseListQuery(search: URLSearchParams): ValidationResult<{ q: string; limit: number; offset: number }> {
  const fields: FieldError[] = [];
  for (const key of new Set(search.keys())) {
    if (!["q", "limit", "offset"].includes(key)) add(fields, key, "unknown_field", "This query parameter is not allowed.");
    if (search.getAll(key).length > 1) add(fields, key, "invalid", "Provide this parameter once.");
  }
  const rawQuery = search.get("q") ?? "";
  const q = rawQuery.trim();
  if (Array.from(q).length > 120 || CONTROL_CHARS.test(q)) add(fields, "q", "invalid", "Use at most 120 characters.");
  const parseInteger = (key: "limit" | "offset", defaultValue: number, min: number, max: number) => {
    const raw = search.get(key);
    if (raw === null) return defaultValue;
    if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
      add(fields, key, "invalid", "Enter a whole number.");
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      add(fields, key, "invalid", `Use a value from ${min} to ${max}.`);
      return undefined;
    }
    return value;
  };
  const limit = parseInteger("limit", DEFAULT_ADMIN_PAGE_SIZE, 1, MAX_ADMIN_PAGE_SIZE);
  const offset = parseInteger("offset", 0, 0, MAX_ADMIN_OFFSET);
  if (fields.length || limit === undefined || offset === undefined) return { ok: false, fields };
  return { ok: true, value: { q, limit, offset } };
}

export function parseDocument<M extends AdminModule>(module: M, value: unknown): ValidationResult<AdminDocument<M>> {
  const fields: FieldError[] = [];
  if (!isObject(value)) return { ok: false, fields: [{ field: "document", code: "invalid", message: "Enter a document object." }] };
  const allowed = [...COMMON_FIELDS, ...MODULE_FIELDS[module]];
  hasOnlyKeys(value, allowed, "document", fields);
  const title = textValue(value, "title", "document.title", fields, 160, { required: true, nonEmpty: true });
  const slug = textValue(value, "slug", "document.slug", fields, 160, { required: true, nonEmpty: true });
  if (slug && !SLUG.test(slug)) add(fields, "document.slug", "invalid", "Use lowercase letters, numbers, and single hyphens.");
  if (slug && ((module === "contact" && slug !== "contact") || (module === "navigation" && slug !== "primary"))) {
    add(fields, "document.slug", "invalid", module === "contact" ? "Use the fixed contact route slug." : "Use the fixed primary navigation slug.");
  }
  const summary = textValue(value, "summary", "document.summary", fields, 1000) ?? "";
  const blocks = parseBlocks(value.blocks, fields);
  const seoTitle = textValue(value, "seoTitle", "document.seoTitle", fields, 160) ?? "";
  const seoDescription = textValue(value, "seoDescription", "document.seoDescription", fields, 320) ?? "";
  const document: ObjectValue = { title, slug, summary, blocks, seoTitle, seoDescription };

  if (module === "products") {
    const categoryIds = uuidArray(value.categoryIds, "document.categoryIds", fields);
    const modelNumbers = textArray(value.modelNumbers, "document.modelNumbers", fields, 20, 80);
    if (modelNumbers && (new Set(modelNumbers.map((model) => model.toLowerCase())).size !== modelNumbers.length || modelNumbers.some((model) => !/[a-z0-9]/i.test(model) || /[\u0000-\u001f\u007f]/u.test(model)))) add(fields, "document.modelNumbers", "invalid", "Use distinct model identifiers containing letters or numbers.");
    const variants = parseVariantRows(value.variants, fields);
    const specifications = parseSpecifications(value.specifications, fields);
    const compatibility = textArray(value.compatibility, "document.compatibility", fields, 50, 240);
    const kitContents = parseKitContents(value.kitContents, fields);
    const resources = parseResourceLinks(value.resources, fields);
    const mediaIds = uuidArray(value.mediaIds, "document.mediaIds", fields);
    const sourceObservation = value.sourceObservation === undefined ? undefined : parseSourceObservation(value.sourceObservation, fields);
    const sourceReview = value.sourceReview === undefined ? undefined : textArray(value.sourceReview, "document.sourceReview", fields, 64, 2000);
    if (sourceReview !== undefined && sourceObservation === undefined) add(fields, "document.sourceReview", "invalid", "Staff review notes require a source observation.");
    Object.assign(document, { categoryIds, modelNumbers, variants, specifications, compatibility, kitContents, resources, mediaIds });
    if (sourceObservation !== undefined) Object.assign(document, { sourceObservation });
    if (sourceReview !== undefined) Object.assign(document, { sourceReview });
  } else if (module === "categories") {
    const parentId = value.parentId === undefined ? null : uuidValue(value.parentId, "document.parentId", fields, true);
    const position = parsePosition(value, fields);
    const mediaIds = uuidArray(value.mediaIds, "document.mediaIds", fields);
    Object.assign(document, { parentId, position, mediaIds });
  } else if (module === "blog") {
    const author = textValue(value, "author", "document.author", fields, 160) ?? "";
    const tags = textArray(value.tags, "document.tags", fields, 30, 60);
    const mediaIds = uuidArray(value.mediaIds, "document.mediaIds", fields);
    Object.assign(document, { author, tags, mediaIds });
  } else if (module === "faqs") {
    const answer = textValue(value, "answer", "document.answer", fields, 8000) ?? "";
    const topic = textValue(value, "topic", "document.topic", fields, 120) ?? "";
    const placements = textArray(value.placements, "document.placements", fields, 30, 120);
    const position = parsePosition(value, fields);
    Object.assign(document, { answer, topic, placements, position });
  } else if (module === "team") {
    const name = textValue(value, "name", "document.name", fields, 160) ?? "";
    const role = textValue(value, "role", "document.role", fields, 120) ?? "";
    const bio = textValue(value, "bio", "document.bio", fields, 4000) ?? "";
    const mediaIds = uuidArray(value.mediaIds, "document.mediaIds", fields);
    const links = parseLinks(value.links, "document.links", fields);
    const position = parsePosition(value, fields);
    Object.assign(document, { name, role, bio, mediaIds, links, position });
  } else if (module === "navigation") {
    const links = parseNavigationLinks(value.links, fields);
    Object.assign(document, { links });
  } else if (module === "contact") {
    const email = textValue(value, "email", "document.email", fields, 254) ?? "";
    const phone = textValue(value, "phone", "document.phone", fields, 48) ?? "";
    const address = textValue(value, "address", "document.address", fields, 1000) ?? "";
    const hours = textValue(value, "hours", "document.hours", fields, 1000) ?? "";
    const timezone = textValue(value, "timezone", "document.timezone", fields, 100) ?? "";
    const socialLinks = parseLinks(value.socialLinks, "document.socialLinks", fields);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) add(fields, "document.email", "invalid", "Enter a valid email address.");
    Object.assign(document, { email, phone, address, hours, timezone, socialLinks });
    for (const [key, max] of [["supportTitle", 120], ["supportText", 1000], ["footerTagline", 160], ["copyrightName", 120]] as const) {
      if (value[key] !== undefined) document[key] = textValue(value, key, `document.${key}`, fields, max) ?? "";
    }
  } else if (module === "learn" || module === "videos") {
    const url = textValue(value, "url", "document.url", fields, 2048, { required: true, nonEmpty: true });
    const productIds = uuidArray(value.productIds, "document.productIds", fields);
    const position = parsePosition(value, fields);
    if (url && module === "videos" && !youtubeId(url)) add(fields, "document.url", "invalid", "Use a valid YouTube video URL or ID.");
    else if (url && module === "learn" && !safeHref(url)) add(fields, "document.url", "invalid", "Use an internal path or HTTPS link.");
    Object.assign(document, { url, productIds, position });
    if (module === "learn") {
      const collection = value.collection === undefined ? "embedded-systems" : value.collection;
      if (!["product-specs", "embedded-systems", "kit-guides"].includes(String(collection))) add(fields, "document.collection", "invalid", "Choose a supported learning collection.");
      Object.assign(document, { collection });
    }
  }

  const serializedLength = new TextEncoder().encode(JSON.stringify(document)).byteLength;
  if (serializedLength > MAX_ADMIN_BODY_BYTES) add(fields, "document", "invalid", "The document is too large.");
  if (fields.length || title === undefined || slug === undefined || !SLUG.test(slug)) return { ok: false, fields };
  return { ok: true, value: document as AdminDocument<M> };
}

export function parseCreateInput(module: AdminModule, value: unknown): ValidationResult<{ document: AdminDocument }> {
  const fields: FieldError[] = [];
  if (!isObject(value)) return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  hasOnlyKeys(value, ["document"], "", fields);
  const document = parseDocument(module, value.document);
  if (!document.ok) fields.push(...document.fields);
  return fields.length || !document.ok ? { ok: false, fields } : { ok: true, value: { document: document.value } };
}

export function parseUpdateInput(module: AdminModule, value: unknown): ValidationResult<{ expectedVersion: number; document: AdminDocument }> {
  const fields: FieldError[] = [];
  if (!isObject(value)) return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  hasOnlyKeys(value, ["expectedVersion", "document"], "", fields);
  const expectedVersion = integerValue(value.expectedVersion, "expectedVersion", fields, 1, Number.MAX_SAFE_INTEGER);
  const document = parseDocument(module, value.document);
  if (!document.ok) fields.push(...document.fields);
  return fields.length || expectedVersion === undefined || !document.ok
    ? { ok: false, fields }
    : { ok: true, value: { expectedVersion, document: document.value } };
}

export type RecordAction = "publish" | "unpublish" | "archive" | "restore";

export function parseActionInput(action: string, value: unknown): ValidationResult<{ action: RecordAction; expectedVersion: number; revisionId: string | null }> {
  const fields: FieldError[] = [];
  const actions: readonly string[] = ["publish", "unpublish", "archive", "restore"];
  if (!actions.includes(action)) return { ok: false, fields: [{ field: "action", code: "invalid", message: "This action is not supported." }] };
  if (!isObject(value)) return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  hasOnlyKeys(value, action === "restore" ? ["expectedVersion", "revisionId"] : ["expectedVersion"], "", fields);
  const expectedVersion = integerValue(value.expectedVersion, "expectedVersion", fields, 1, Number.MAX_SAFE_INTEGER);
  let revisionId: string | null = null;
  if (action === "restore") {
    const parsed = uuidValue(value.revisionId, "revisionId", fields);
    if (parsed) revisionId = parsed;
  }
  return fields.length || expectedVersion === undefined || (action === "restore" && !revisionId)
    ? { ok: false, fields }
    : { ok: true, value: { action: action as RecordAction, expectedVersion, revisionId } };
}

export type VariantPriceUpdate = {
  expectedVersion: number;
  regularPaise: number;
  salePaise: number | null;
  saleFrom: string | null;
  saleUntil: string | null;
  reason: string;
};

export type InventoryAdjustment = {
  expectedVersion: number;
  delta: number;
  reason: string;
  requestId: string;
};

export type AdminVariantDto = {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  label: string;
  regularPaise: number | null;
  salePaise: number | null;
  saleFrom: string | null;
  saleUntil: string | null;
  priceVersion: number;
  stock: number | null;
  stockVersion: number | null;
};

function nullablePaise(value: unknown, field: string, fields: FieldError[]): number | null | undefined {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000_000) {
    add(fields, field, "invalid", "Enter an amount from 0 to 10,000,000,000 paise, or leave it unset.");
    return undefined;
  }
  return value as number;
}

function nullableUtcIso(value: unknown, field: string, fields: FieldError[]): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    add(fields, field, "invalid", "Enter a valid UTC date and time ending in Z, or leave it unset.");
    return undefined;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    add(fields, field, "invalid", "Enter a valid UTC date and time ending in Z, or leave it unset.");
    return undefined;
  }
  return new Date(time).toISOString();
}

function parseReason(value: unknown, fields: FieldError[]): string | undefined {
  if (typeof value !== "string") {
    add(fields, "reason", "required", "Enter a reason.");
    return undefined;
  }
  const reason = value.trim();
  if (!reason || Array.from(reason).length > 500 || CONTROL_CHARS.test(reason)) {
    add(fields, "reason", "invalid", "Use 1 to 500 characters.");
    return undefined;
  }
  return reason;
}

export function parseVariantId(value: string): string | null {
  return parseRecordId(value);
}

export function parseVariantPriceUpdate(value: unknown): ValidationResult<VariantPriceUpdate> {
  const fields: FieldError[] = [];
  if (!isObject(value)) return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  hasOnlyKeys(value, ["expectedVersion", "regularPaise", "salePaise", "saleFrom", "saleUntil", "reason"], "", fields);
  const expectedVersion = integerValue(value.expectedVersion, "expectedVersion", fields, 0, Number.MAX_SAFE_INTEGER);
  const regularPaise = nullablePaise(value.regularPaise, "regularPaise", fields);
  if (regularPaise === null) add(fields, "regularPaise", "invalid", "A configured regular price cannot be cleared.");
  const salePaise = nullablePaise(value.salePaise, "salePaise", fields);
  const saleFrom = nullableUtcIso(value.saleFrom, "saleFrom", fields);
  const saleUntil = nullableUtcIso(value.saleUntil, "saleUntil", fields);
  const reason = parseReason(value.reason, fields);
  if (salePaise === null && (saleFrom !== null || saleUntil !== null)) {
    add(fields, "saleFrom", "invalid", "Clear both sale dates when there is no sale price.");
  }
  if (salePaise !== null && salePaise !== undefined) {
    if (regularPaise === null || regularPaise === undefined) add(fields, "regularPaise", "invalid", "Set a regular price before adding a sale price.");
    else if (salePaise > regularPaise) add(fields, "salePaise", "invalid", "The sale price cannot exceed the regular price.");
    if (saleFrom === null || saleFrom === undefined) add(fields, "saleFrom", "required", "Set the sale start time.");
    if (saleUntil === null || saleUntil === undefined) add(fields, "saleUntil", "required", "Set the sale end time.");
    if (saleFrom && saleUntil && Date.parse(saleFrom) >= Date.parse(saleUntil)) {
      add(fields, "saleUntil", "invalid", "The sale end must be after its start.");
    }
  }
  return fields.length || expectedVersion === undefined || regularPaise === undefined || regularPaise === null || salePaise === undefined || saleFrom === undefined || saleUntil === undefined || reason === undefined
    ? { ok: false, fields }
    : { ok: true, value: { expectedVersion, regularPaise, salePaise, saleFrom, saleUntil, reason } };
}

export function parseInventoryAdjustment(value: unknown): ValidationResult<InventoryAdjustment> {
  const fields: FieldError[] = [];
  if (!isObject(value)) return { ok: false, fields: [{ field: "body", code: "invalid", message: "Enter a JSON object." }] };
  hasOnlyKeys(value, ["expectedVersion", "delta", "reason", "requestId"], "", fields);
  const expectedVersion = integerValue(value.expectedVersion, "expectedVersion", fields, 0, Number.MAX_SAFE_INTEGER);
  const delta = integerValue(value.delta, "delta", fields, -1_000_000, 1_000_000);
  if (delta === 0) add(fields, "delta", "invalid", "Enter a nonzero stock adjustment.");
  const reason = parseReason(value.reason, fields);
  const requestId = uuidValue(value.requestId, "requestId", fields);
  return fields.length || expectedVersion === undefined || delta === undefined || reason === undefined || !requestId
    ? { ok: false, fields }
    : { ok: true, value: { expectedVersion, delta, reason, requestId } };
}
