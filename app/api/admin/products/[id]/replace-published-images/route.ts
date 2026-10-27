import { editorialAccess, editorialBody, editorialError, editorialRpc } from "@/lib/editorial/http";
import { parseImagePublication } from "@/lib/editorial/image-publication";
import { UUID_PATTERN } from "@/lib/editorial/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  for (const capability of ["catalog.edit", "content.publish"] as const) {
    const access = await editorialAccess(capability);
    if (access instanceof Response) return access;
  }
  const body = await editorialBody(request);
  if (body instanceof Response) return body;
  const parsed = parseImagePublication(body.value);
  if (!parsed) return editorialError("invalid_input", 400);
  return editorialRpc("admin_replace_published_product_images", {
    p_id: id, p_expected_version: parsed.expectedVersion,
    p_expected_revision_id: parsed.expectedRevisionId, p_replacements: parsed.replacements,
  });
}
