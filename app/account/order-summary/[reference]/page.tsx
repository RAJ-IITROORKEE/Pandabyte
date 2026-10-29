import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountOrderDocument } from "@/components/account-order-document";

export default async function OrderSummaryPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/account/order-summary/${encodeURIComponent(reference)}`)}`);
  }
  return <AccountOrderDocument reference={reference} />;
}
