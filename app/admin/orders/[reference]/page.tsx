import { AdminOrderDetail } from "@/components/admin/order-detail";
export default async function AdminOrderDetailPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { reference } = await params;
  const { returnTo } = await searchParams;
  return <AdminOrderDetail reference={reference} returnTo={typeof returnTo === "string" ? returnTo : undefined} />;
}
