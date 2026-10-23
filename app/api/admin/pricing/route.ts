import { adminListPricing } from "@/lib/admin/records";

export async function GET(request: Request) {
  return adminListPricing(request);
}
