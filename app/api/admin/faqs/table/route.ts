import { adminListFaqTable } from "@/lib/admin/faq-table";

export async function GET(request: Request) {
  return adminListFaqTable(request);
}
