export type MediaItem = { id: string; filename: string; mimeType: string; byteSize: number; width: number | null; height: number | null; altText: string; source: string; version: number; published: boolean; archived: boolean; referenced: boolean; publicUseAllowed: boolean | null; triangles: number | null; url: string; createdAt: string; updatedAt: string };
export type MediaStats = { total: number; images: number; documents: number; models: number; published: number; private: number; totalBytes: number };
export type MediaWorkspace = { items: MediaItem[]; total: number; stats: MediaStats };
export type MediaUsageItem = { title: string; kind: string | null; slug: string | null; status: string | null; url: string | null };
export type MediaDetail = { media: MediaItem; usage: { items: MediaUsageItem[]; total: number; limit: number; truncated: boolean } };
export type MediaQuery = { query: string; type: "all" | "image" | "document" | "model"; status: "all" | "private" | "published"; sort: "newest" | "oldest" | "name"; limit: number; offset: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const metadataText = (v: unknown, max: number) => typeof v === "string" && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const timestamp = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseMediaQuery(url: string): MediaQuery | null {
  let p: URLSearchParams; try { p = new URL(url).searchParams; } catch { return null; }
  if ([...p.keys()].some(k => !["q","type","status","sort","limit","offset"].includes(k)) || [...new Set(p.keys())].some(k => p.getAll(k).length !== 1)) return null;
  const query = (p.get("q") ?? "").trim(), type = p.get("type") ?? "all", status = p.get("status") ?? "all", sort = p.get("sort") ?? "newest", limit = p.get("limit") ?? "25", offset = p.get("offset") ?? "0";
  if (!text(query,100) || !["all","image","document","model"].includes(type) || !["all","private","published"].includes(status) || !["newest","oldest","name"].includes(sort) || !/^\d{1,2}$/.test(limit) || !/^\d{1,7}$/.test(offset) || +limit < 1 || +limit > 50 || +offset > 1000000) return null;
  return {query,type,status,sort,limit:+limit,offset:+offset} as MediaQuery;
}
export function parseMediaItem(value: unknown): MediaItem | null {
  if (!object(value) || !exact(value,["id","filename","mimeType","byteSize","width","height","altText","source","version","published","archived","referenced","publicUseAllowed","triangles","url","createdAt","updatedAt"]) || typeof value.id !== "string" || !uuid.test(value.id) || !text(value.filename,255) || !text(value.mimeType,100) || !integer(value.byteSize) || !(value.width === null || integer(value.width)) || !(value.height === null || integer(value.height)) || !metadataText(value.altText,300) || !metadataText(value.source,500) || !integer(value.version) || value.version < 1 || typeof value.published !== "boolean" || typeof value.archived !== "boolean" || typeof value.referenced !== "boolean" || !(value.publicUseAllowed === null || typeof value.publicUseAllowed === "boolean") || !(value.triangles === null || integer(value.triangles)) || value.url !== `/api/media/${value.id}` || !timestamp(value.createdAt) || !timestamp(value.updatedAt)) return null;
  return value as MediaItem;
}
export function parseMediaWorkspace(value: unknown): MediaWorkspace | null {
  if (!object(value) || !exact(value,["items","total","stats"]) || !Array.isArray(value.items) || value.items.length > 50 || !integer(value.total) || value.total < value.items.length || !object(value.stats) || !exact(value.stats,["total","images","documents","models","published","private","totalBytes"]) || !Object.values(value.stats).every(integer) || value.items.some((v: unknown) => !parseMediaItem(v))) return null;
  return value as MediaWorkspace;
}
export function parseMediaDetail(value: unknown): MediaDetail | null {
  if (!object(value) || !exact(value,["media","usage"]) || !parseMediaItem(value.media) || !object(value.usage) || !exact(value.usage,["items","total","limit","truncated"]) || !Array.isArray(value.usage.items) || !integer(value.usage.total) || !integer(value.usage.limit) || value.usage.limit > 50 || value.usage.items.length > value.usage.limit || value.usage.total < value.usage.items.length || typeof value.usage.truncated !== "boolean" || value.usage.truncated !== (value.usage.total > value.usage.items.length)) return null;
  if (!value.usage.items.every((v: unknown) => object(v) && exact(v,["title","kind","slug","status","url"]) && text(v.title,300) && (v.kind === null || text(v.kind,80)) && (v.slug === null || text(v.slug,240)) && (v.status === null || text(v.status,80)) && (v.url === null || (typeof v.url === "string" && /^\/admin\/[a-z0-9/_-]+$/i.test(v.url))))) return null;
  return value as MediaDetail;
}
