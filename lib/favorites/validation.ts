import { parseRecordId, parseSlug } from "../admin/validation.ts";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every((key) => key in value);

export function parseFavoriteIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const ids: string[] = [];
  for (const item of value) {
    const id = typeof item === "string" ? parseRecordId(item) : null;
    if (!id || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids;
}

export function parseFavoritesRequest(value: unknown): { expectedVersion: number; productIds: string[] } | null {
  if (!object(value) || !keys(value, ["expectedVersion", "productIds"]) || !Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0 || Number(value.expectedVersion) > 9007199254740990) return null;
  const productIds = parseFavoriteIds(value.productIds);
  return productIds ? { expectedVersion: Number(value.expectedVersion), productIds } : null;
}

export function parseFavorites(value: unknown): { version: number; items: { productId: string; title: string | null; slug: string | null }[] } | null {
  if (!object(value) || !keys(value, ["version", "items"]) || !Number.isSafeInteger(value.version) || Number(value.version) < 0 || !Array.isArray(value.items) || value.items.length > 50) return null;
  const items: { productId: string; title: string | null; slug: string | null }[] = [];
  for (const item of value.items) {
    if (!object(item) || !keys(item, ["productId", "title", "slug"])) return null;
    const productId = typeof item.productId === "string" ? parseRecordId(item.productId) : null;
    if (!productId || items.some((entry) => entry.productId === productId)) return null;
    if (!(item.title === null && item.slug === null) && !(typeof item.title === "string" && item.title.trim().length > 0 && Array.from(item.title).length <= 160 && !/[\u0000-\u001f\u007f]/.test(item.title) && typeof item.slug === "string" && parseSlug(item.slug))) return null;
    items.push({ productId, title: item.title as string | null, slug: item.slug as string | null });
  }
  if (value.version === 0 && items.length) return null;
  return { version: Number(value.version), items };
}
