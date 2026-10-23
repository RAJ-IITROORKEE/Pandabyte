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
  return patch ? editorialRpc("admin_update_media", { p_id: id, p_expected_version: patch.expectedVersion, p_alt: patch.altText, p_source: patch.source, p_published: patch.published, p_archive: false }) : editorialError("invalid_media", 400);
}
