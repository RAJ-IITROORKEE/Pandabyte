import { AdminOrderDetail } from "@/components/admin/order-detail";
export default async function AdminOrderDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <AdminOrderDetail reference={reference} />;
}
