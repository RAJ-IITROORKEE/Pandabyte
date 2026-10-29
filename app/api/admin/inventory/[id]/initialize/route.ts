import { adminInitializeInventory } from "@/lib/admin/records";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return adminInitializeInventory(request, (await params).id);
}
