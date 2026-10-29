import { adminOrderActivity } from "@/lib/admin/orders";

export async function GET(_request: Request, { params }: { params: Promise<{ reference: string }> }) {
  try { return await adminOrderActivity((await params).reference); }
  catch { return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
}
