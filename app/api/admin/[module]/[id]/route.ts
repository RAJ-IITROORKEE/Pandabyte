import { adminGet, adminUpdate } from "@/lib/admin/records";

type Context = { params: Promise<{ module: string; id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { module, id } = await params;
  return adminGet(request, module, id);
}

export async function PATCH(request: Request, { params }: Context) {
  const { module, id } = await params;
  return adminUpdate(request, module, id);
}
