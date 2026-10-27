import { adminListVideosTable } from "@/lib/admin/videos-table";

export async function GET(request: Request) {
  return adminListVideosTable(request);
}
