import { adminListCategories } from "@/lib/admin/categories";

export async function GET(request: Request) {
  return adminListCategories(request);
}
