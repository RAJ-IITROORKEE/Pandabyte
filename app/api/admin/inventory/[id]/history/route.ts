import { adminInventoryHistory } from "@/lib/admin/records";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return adminInventoryHistory(request, (await params).id);
}
