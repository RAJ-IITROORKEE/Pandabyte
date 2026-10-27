import { parseContentTableQuery, type ContentTableQuery } from "./pages-table-contract.ts";
import type { ValidationResult } from "./validation.ts";

export type LearnTableQuery = ContentTableQuery & { collection: "all" | "product-specs" | "embedded-systems" | "kit-guides" };

export function parseLearnTableQuery(search: URLSearchParams): ValidationResult<LearnTableQuery> {
  const collection = search.get("collection") ?? "all";
  const rest = new URLSearchParams(search);
  rest.delete("collection");
  const parsed = parseContentTableQuery(rest);
  const fields = parsed.ok ? [] : parsed.fields;
  if (search.getAll("collection").length > 1 || !["all", "product-specs", "embedded-systems", "kit-guides"].includes(collection)) {
    fields.push({ field: "collection", code: "invalid", message: "Choose a supported learning collection." });
  }
  if (!parsed.ok || fields.length) return { ok: false, fields };
  return { ok: true, value: { ...parsed.value, collection: collection as LearnTableQuery["collection"] } };
}
