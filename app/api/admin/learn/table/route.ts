import { adminListLearnTable } from "@/lib/admin/learn-table";

export async function GET(request: Request) {
  return adminListLearnTable(request);
}
