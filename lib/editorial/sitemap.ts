import "server-only";
import { createInsforgePublicClient } from "@/lib/insforge/public";
export const SITEMAP_PAGE_SIZE = 1000;

export async function publishedSitemapPage(page: number) {
  if (!Number.isInteger(page) || page < 0 || page > 1000) throw new Error("Invalid sitemap page.");
  const { data, error } = await createInsforgePublicClient().database.schema("public").rpc("published_sitemap", {
    p_limit: SITEMAP_PAGE_SIZE, p_offset: page * SITEMAP_PAGE_SIZE,
  });
  if (error || !data || !Array.isArray(data.items) || data.items.length > SITEMAP_PAGE_SIZE || !Number.isSafeInteger(data.total) || data.total < 0 || data.total>1_001_000) throw new Error("Sitemap is temporarily unavailable.");
  const items: {path:string;publishedAt:string}[] = data.items.map((item: unknown) => {
    if (!item || typeof item !== "object" || !("path" in item) || !("publishedAt" in item) ||
      typeof item.path !== "string" || !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/.test(item.path) ||
      /^\/(?:api|admin|staff|account|sign-in|sign-up|checkout|cart|agent|_content)(?:\/|$)/.test(item.path) ||
      typeof item.publishedAt !== "string" || !Number.isFinite(Date.parse(item.publishedAt))) throw new Error("Sitemap is temporarily unavailable.");
    return {path:item.path,publishedAt:item.publishedAt};
  });
  return {items,total:data.total as number};
}
