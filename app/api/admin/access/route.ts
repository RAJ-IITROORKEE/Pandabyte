import { getStaffAccess } from "@/lib/authorization";
import { editorialError, editorialJson } from "@/lib/editorial/http";

export async function GET() {
  const access = await getStaffAccess();
  return access.allowed ? editorialJson({ capabilities: access.capabilities }) : editorialError(access.status === 401 ? "unauthorized" : access.status === 403 ? "forbidden" : "backend_unavailable", access.status);
}
