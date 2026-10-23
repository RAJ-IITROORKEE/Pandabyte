import { publishedList } from "@/lib/admin/records";

type Context = { params: Promise<{ module: string }> };

export async function GET(request: Request, { params }: Context) {
  return publishedList(request, (await params).module);
}
