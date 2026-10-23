import { adminCreate, adminList } from "@/lib/admin/records";

type Context = { params: Promise<{ module: string }> };

export async function GET(request: Request, { params }: Context) {
  return adminList(request, (await params).module);
}

export async function POST(request: Request, { params }: Context) {
  return adminCreate(request, (await params).module);
}
