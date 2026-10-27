export { youtubeVideoId } from "../../lib/youtube.ts";

export function editorialSearchQuery(value: unknown): string {
  if (typeof value !== "string") return "";
  const query = value.trim();
  return query.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(query) ? query : "";
}

export function editorialPageNumber(value: unknown, pageSize: number): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 1;
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page < 1 || (page - 1) * pageSize > 10_000) return 1;
  return page;
}
