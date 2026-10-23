import { editorialAccess, editorialError, editorialRpc } from "@/lib/editorial/http";
import { parseListQuery } from "@/lib/editorial/validation";

export async function GET(request: Request) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const query = parseListQuery(request.url);
  return query ? editorialRpc("admin_list_inquiries", { p_query: query.query, p_status: query.status, p_limit: query.limit, p_offset: query.offset }) : editorialError("invalid_query", 400);
}
