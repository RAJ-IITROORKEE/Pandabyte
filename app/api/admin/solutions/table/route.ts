import { adminListSolutionsTable } from "@/lib/admin/solutions-table";

export async function GET(request: Request) {
  return adminListSolutionsTable(request);
}
