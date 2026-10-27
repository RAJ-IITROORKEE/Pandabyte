import { adminListBlogTable } from "@/lib/admin/blog-table";

export async function GET(request: Request) {
  return adminListBlogTable(request);
}
