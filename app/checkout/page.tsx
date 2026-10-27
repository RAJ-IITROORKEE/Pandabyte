import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PublicPage } from "@/components/storefront/page-frame";
import { CheckoutReview } from "@/components/cart/checkout-review";

export default async function CheckoutPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fcheckout");
  }

  return (
    <PublicPage title="Checkout" description="Review your items and provisional subtotal.">
      <CheckoutReview />
    </PublicPage>
  );
}
