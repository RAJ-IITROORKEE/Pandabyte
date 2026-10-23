import { requireCapability } from "@/lib/authorization";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  const access = await requireCapability("content.edit");
  if (!access.allowed) {
    const error = access.status === 401
      ? "unauthorized"
      : access.status === 403
        ? "forbidden"
        : "staff_access_unavailable";
    return Response.json({ error }, { status: access.status, headers: privateHeaders });
  }

  return Response.json(
    { capability: "content.edit", authorized: true },
    { headers: privateHeaders },
  );
}
