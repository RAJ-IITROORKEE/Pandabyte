import { adminListInventory } from "@/lib/admin/records";

export async function GET(request: Request) {
  return adminListInventory(request);
}
