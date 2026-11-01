import { getStaffAccess } from "@/lib/authorization";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { parseMediaDetail } from "@/lib/admin/media-contract";
import { editorialAccess, editorialBody, editorialError, editorialRpc, editorialJson, editorialDatabaseError } from "@/lib/editorial/http";
import { parseMediaPatch, UUID_PATTERN } from "@/lib/editorial/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getStaffAccess();
  if (!access.allowed) return editorialError(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);
  if (!access.capabilities.some(cap => ["media.manage", "catalog.edit", "content.edit"].includes(cap))) return editorialError("forbidden", 403);
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc("admin_media_details", { p_id: id });
    if (result.error) return editorialDatabaseError(result.error);
    const detail = parseMediaDetail(result.data);
    return detail ? editorialJson(detail) : editorialError("backend_unavailable", 503);
  } catch { return editorialError("backend_unavailable", 503); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("media.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request);
  if (body instanceof Response) return body;
  const patch = parseMediaPatch(body.value);
  if (!patch) return editorialError("invalid_media", 400);
  const common = { p_id: id, p_expected_version: patch.expectedVersion, p_alt: patch.altText, p_source: patch.source, p_published: patch.published };
  return "publicUseAllowed" in patch
    ? editorialRpc("admin_update_model_media", { ...common, p_public_allowed: patch.publicUseAllowed })
    : editorialRpc("admin_update_media", { ...common, p_archive: false });
}
