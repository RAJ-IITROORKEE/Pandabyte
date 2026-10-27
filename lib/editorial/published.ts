import "server-only";
import { cache } from "react";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { ADMIN_MODULES, parseRecordId, parseSlug, type AdminModule } from "@/lib/admin/validation";
import { parsePublishedRecord, type PublishedRecord } from "@/lib/editorial/public-record";
export { parsePublishedRecord } from "@/lib/editorial/public-record";
export type { PublishedRecord, PublicVariant } from "@/lib/editorial/public-record";

const readRecord = cache(async (module: AdminModule, slug: string): Promise<unknown> => {
  const client = createInsforgePublicClient();
  const { data, error } = await client.database.schema("public").rpc("published_get_record", { p_kind: ADMIN_MODULES[module].kind, p_slug: slug });
  if (error) {
    if (error.details === "not_found") return null;
    throw new Error("Published content is temporarily unavailable.");
  }
  return data;
});

export async function getPublishedRecord<M extends AdminModule>(module: M, slug: string): Promise<PublishedRecord<M> | { redirectTo: string } | null> {
  if (!parseSlug(slug)) return null;
  const data = await readRecord(module, slug);
  if (data === null) return null;
  if (typeof data !== "object" || !data) throw new Error("Published content could not be rendered.");
  if ("redirectTo" in data && typeof data.redirectTo === "string" && parseSlug(data.redirectTo) && data.redirectTo !== slug) return { redirectTo: data.redirectTo };
  return parsePublishedRecord(module, "record" in data ? data.record : null);
}

export type PublishedListOptions = {
  q?: string; placement?: string; collection?: "product-specs" | "embedded-systems" | "kit-guides";
  productId?: string; limit?: number; offset?: number;
  tag?: string;
};

export async function listPublishedFaqs(options: { q?: string; topic?: string; placement?: string; limit?: number; offset?: number } = {}) {
  const { q = "", topic = "", placement = "", limit = 24, offset = 0 } = options;
  if ([q, topic, placement].some(value => value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) ||
    !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error("Invalid published FAQ query.");
  const { data, error } = await createInsforgePublicClient().database.schema("public").rpc("published_list_faqs", {
    p_query: q, p_topic: topic, p_placement: placement, p_limit: limit, p_offset: offset,
  });
  if (error || !data || !Array.isArray(data.items) || data.items.length > limit || !Number.isSafeInteger(data.total) || data.total < 0 ||
    !Array.isArray(data.topics) || data.topics.length > 100 || data.topics.some((value: unknown) => typeof value !== "string" || !value.trim() || value.length > 120) || typeof data.topicsTruncated !== "boolean") throw new Error("Published FAQs are temporarily unavailable.");
  return { items: data.items.map((item: unknown) => parsePublishedRecord("faqs", item)), total: data.total, topics: data.topics as string[], topicsTruncated: data.topicsTruncated as boolean };
}

export async function listPublishedRecords<M extends AdminModule>(module: M, options: PublishedListOptions = {}): Promise<{ items: PublishedRecord<M>[]; total: number }> {
  const { q = "", placement = "", collection = "", productId, limit = 24, offset = 0, tag = "" } = options;
  if (q.length > 120 || /[\u0000-\u001f\u007f]/u.test(q) || placement.length > 120 ||
    !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
    (productId && !parseRecordId(productId)) || tag.length > 60 || /[\u0000-\u001f\u007f]/u.test(tag) || (tag && module !== "blog")) throw new Error("Invalid published content query.");
  if (module === "faqs") return await listPublishedFaqs({ q, placement, limit, offset }) as { items: PublishedRecord<M>[]; total: number };
  const args = module === "blog" ? {p_query:q,p_tag:tag,p_limit:limit,p_offset:offset} : {
    p_kind: ADMIN_MODULES[module].kind, p_query: q, p_placement: placement, p_collection: collection,
    p_product_id: productId ?? null, p_limit: limit, p_offset: offset,
  };
  const { data, error } = await createInsforgePublicClient().database.schema("public").rpc(module === "blog" ? "published_list_blog" : "published_list_content", args);
  if (error || !data || !Array.isArray(data.items) || data.items.length > limit || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error("Published content is temporarily unavailable.");
  return { items: data.items.map((item: unknown) => parsePublishedRecord(module, item)), total: data.total };
}

export async function listPublishedBlogTags(): Promise<string[]> {
  const {data,error} = await createInsforgePublicClient().database.schema("public").rpc("published_blog_tags");
  if (error || !Array.isArray(data) || data.length > 100 || data.some((tag:unknown)=>typeof tag!=="string" || !tag.trim() || tag.length>60)) throw new Error("Blog topics are temporarily unavailable.");
  return data;
}
