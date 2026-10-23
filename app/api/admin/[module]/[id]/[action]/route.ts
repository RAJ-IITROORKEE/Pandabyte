import { adminTransition } from "@/lib/admin/records";

type Context = { params: Promise<{ module: string; id: string; action: string }> };

export async function POST(request: Request, { params }: Context) {
  const { module, id, action } = await params;
  return adminTransition(request, module, id, action);
}
