import "server-only";
import { createInsforgePublicClient } from "@/lib/insforge/public";
import { ADMIN_MODULES, parseDocument, parseSlug, type AdminModule } from "@/lib/admin/validation";

export async function getPublishedRecord(module: AdminModule, slug: string) {
  if (!parseSlug(slug)) return null;
  const client = createInsforgePublicClient();
  const { data, error } = await client.database.schema("public").rpc("published_get_record", { p_kind: ADMIN_MODULES[module].kind, p_slug: slug });
  if (error) {
    if (error.details === "not_found") return null;
    throw new Error("Published content is temporarily unavailable.");
  }
  if (typeof data?.redirectTo === "string" && parseSlug(data.redirectTo)) return { redirectTo: data.redirectTo };
  const document = parseDocument(module, data?.record?.document);
  if (!document.ok) throw new Error("Published content could not be rendered.");
  return { document: document.value, variants: data.record.variants ?? [] };
}
