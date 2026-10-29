"use client";

import { useUser } from "@clerk/nextjs";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import { AdminOrdersScreen } from "./orders-screen";

export function AdminOrdersSession() {
  const { isLoaded, user } = useUser();
  if (!isLoaded) return <p role="status">Loading order access…</p>;
  if (!user) return <AdminAccessDeniedScreen title="Orders" />;
  return <AdminOrdersScreen key={user.id} />;
}
