import { adminListTeamTable } from "@/lib/admin/team-table";

export async function GET(request: Request) {
  return adminListTeamTable(request);
}
