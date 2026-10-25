import { requireCapability } from "@/lib/authorization";
import { operationalJson } from "@/lib/observability/events";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const access = await requireCapability("content.edit");
  if (!access.allowed) {
    const error = access.status === 401
      ? "unauthorized"
      : access.status === 403
        ? "forbidden"
        : "staff_access_unavailable";
    return operationalJson({ error }, access.status, privateHeaders, "staff_access");
  }

  return Response.json(
    { capability: "content.edit", authorized: true },
    { headers: privateHeaders },
  );
}
