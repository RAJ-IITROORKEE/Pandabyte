import { Suspense } from "react";
import { AdminOrdersSession } from "@/components/admin/orders-session";

export default function AdminOrdersPage() {
  return <Suspense fallback={<p role="status">Loading orders…</p>}><AdminOrdersSession /></Suspense>;
}
