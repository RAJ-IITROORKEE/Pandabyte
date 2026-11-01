import { editorialAccess, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { UUID_PATTERN } from "@/lib/editorial/validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  try {
    const client = await createInsforgeServerClient();
    const result = await client.database.schema("public").rpc("admin_inquiry_attachments", { p_id: id });
    return result.error ? editorialDatabaseError(result.error) : editorialJson(result.data);
  } catch { return editorialError("backend_unavailable", 503); }
}
