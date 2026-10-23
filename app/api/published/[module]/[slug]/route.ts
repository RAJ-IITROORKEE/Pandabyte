import { publishedGet } from "@/lib/admin/records";

type Context = { params: Promise<{ module: string; slug: string }> };

export async function GET(request: Request, { params }: Context) {
  const { module, slug } = await params;
  return publishedGet(request, module, slug);
}
