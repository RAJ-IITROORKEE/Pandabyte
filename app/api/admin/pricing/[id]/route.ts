import { adminSetVariantPrice } from "@/lib/admin/records";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return adminSetVariantPrice(request, (await params).id);
}
