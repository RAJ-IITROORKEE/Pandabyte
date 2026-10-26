import { editorialAccess, editorialBody, editorialError, editorialRpc } from "@/lib/editorial/http";
import { parseMediaPatch, UUID_PATTERN } from "@/lib/editorial/validation";

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
