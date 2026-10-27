import { editorialAccess, editorialError, editorialRpc } from "@/lib/editorial/http";
import { parseAdminInquiryListQuery } from "@/lib/admin/inquiry-list-contract";

export async function GET(request: Request) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const query = parseAdminInquiryListQuery(new URL(request.url).searchParams);
  return query ? editorialRpc("admin_query_inquiries", {
    p_query: query.query, p_status: query.status, p_sort: query.sort, p_limit: query.limit, p_offset: query.offset,
  }) : editorialError("invalid_query", 400);
}
