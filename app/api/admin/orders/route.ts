import { adminListOrders } from "@/lib/admin/orders";

export async function GET(request: Request) {
  return adminListOrders(request);
}
