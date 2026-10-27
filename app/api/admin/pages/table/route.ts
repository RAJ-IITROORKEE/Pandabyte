import { adminListPagesTable } from "@/lib/admin/pages-table";

export async function GET(request: Request) {
  return adminListPagesTable(request);
}
