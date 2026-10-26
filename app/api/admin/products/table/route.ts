import { adminListProducts } from "@/lib/admin/products";

export async function GET(request: Request) {
  return adminListProducts(request);
}
