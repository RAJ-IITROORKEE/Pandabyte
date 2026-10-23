import { editorialAccess, editorialBody, editorialError, editorialRpc } from "@/lib/editorial/http";
import { parseInquiryPatch, UUID_PATTERN } from "@/lib/editorial/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  return UUID_PATTERN.test(id) ? editorialRpc("admin_get_inquiry", { p_id: id }) : editorialError("not_found", 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request);
  if (body instanceof Response) return body;
  const patch = parseInquiryPatch(body.value);
  return patch ? editorialRpc("admin_update_inquiry", { p_id: id, p_expected_version: patch.expectedVersion, p_status: patch.status, p_note: patch.note }) : editorialError("invalid_inquiry", 400);
}
