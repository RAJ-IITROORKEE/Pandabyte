import { adminListProductPrices } from "@/lib/admin/products";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return adminListProductPrices(request, (await params).id);
}
