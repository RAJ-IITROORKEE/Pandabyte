import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OrderConfirmation } from "@/components/cart/order-confirmation";

export default async function ConfirmationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/checkout/confirmation/${encodeURIComponent(reference)}`)}`);
  }
  return <OrderConfirmation reference={reference} />;
}
