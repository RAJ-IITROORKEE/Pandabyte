export const ADMIN_INQUIRY_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;
export const ADMIN_INQUIRY_SORTS = ["created_desc", "created_asc", "name_asc", "name_desc"] as const;

export type AdminInquiryListQuery = {
  query: string;
  status: (typeof ADMIN_INQUIRY_STATUSES)[number] | null;
  sort: (typeof ADMIN_INQUIRY_SORTS)[number];
  limit: number;
  offset: number;
};

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;
const QUERY_KEYS = new Set(["q", "status", "sort", "limit", "offset"]);

export function parseAdminInquiryListQuery(search: URLSearchParams): AdminInquiryListQuery | null {
  if ([...new Set(search.keys())].some((key) => !QUERY_KEYS.has(key) || search.getAll(key).length > 1)) return null;

  const rawQuery = search.get("q") ?? "";
  const query = rawQuery.trim();
  const status = search.get("status") || null;
  const sort = search.get("sort") ?? "created_desc";
  const limitText = search.get("limit") ?? "25";
  const offsetText = search.get("offset") ?? "0";
  if (Array.from(rawQuery).length > 100 || CONTROL_CHARS.test(rawQuery) ||
    (status !== null && !(ADMIN_INQUIRY_STATUSES as readonly string[]).includes(status)) ||
    !(ADMIN_INQUIRY_SORTS as readonly string[]).includes(sort) || !/^\d{1,2}$/.test(limitText) || !/^\d{1,7}$/.test(offsetText)) return null;

  const limit = Number(limitText), offset = Number(offsetText);
  return limit >= 1 && limit <= 50 && offset <= 1_000_000
    ? { query, status: status as AdminInquiryListQuery["status"], sort: sort as AdminInquiryListQuery["sort"], limit, offset }
    : null;
}
