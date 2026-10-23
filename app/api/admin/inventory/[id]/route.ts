import { adminAdjustInventory } from "@/lib/admin/records";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return adminAdjustInventory(request, (await params).id);
}
