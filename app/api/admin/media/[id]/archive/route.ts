import { editorialAccess, editorialBody, editorialError, editorialRpc } from "@/lib/editorial/http";
import { objectWithKeys, UUID_PATTERN } from "@/lib/editorial/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("media.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request);
  if (body instanceof Response) return body;
  if (!objectWithKeys(body.value, ["expectedVersion"]) || !Number.isSafeInteger(body.value.expectedVersion) || Number(body.value.expectedVersion) < 1) return editorialError("invalid_version", 400);
  return editorialRpc("admin_update_media", { p_id: id, p_expected_version: body.value.expectedVersion, p_alt: null, p_source: null, p_published: false, p_archive: true });
}
