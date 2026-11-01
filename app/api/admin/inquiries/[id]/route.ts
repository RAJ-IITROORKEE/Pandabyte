import { editorialAccess, editorialBody, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { objectWithKeys, parseInquiryPatch, UUID_PATTERN } from "@/lib/editorial/validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { notificationSettings } from "@/lib/contact/notifications";

async function inquiryResponse(name: string, args: Record<string, unknown>) {
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc(name, args);
    return result.error ? editorialDatabaseError(result.error) : editorialJson({ ...result.data, notificationAvailable: !!notificationSettings(process.env) });
  } catch { return editorialError("backend_unavailable", 503); }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  return UUID_PATTERN.test(id) ? inquiryResponse("admin_get_inquiry", { p_id: id }) : editorialError("not_found", 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request);
  if (body instanceof Response) return body;
  const patch = parseInquiryPatch(body.value);
  return patch ? inquiryResponse("admin_update_inquiry", { p_id: id, p_expected_version: patch.expectedVersion, p_status: patch.status, p_note: patch.note }) : editorialError("invalid_inquiry", 400);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request, 1024);
  if (body instanceof Response) return body;
  if (!objectWithKeys(body.value, ["expectedVersion"]) || !Number.isSafeInteger(body.value.expectedVersion) || Number(body.value.expectedVersion) < 1) return editorialError("invalid_inquiry", 400);
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc("admin_delete_inquiry", { p_id: id, p_expected_version: body.value.expectedVersion });
    if (result.error) return editorialDatabaseError(result.error);
    return result.data?.deleted === true ? editorialJson({ deleted: true }) : editorialError("backend_unavailable", 503);
  } catch { return editorialError("backend_unavailable", 503); }
}
