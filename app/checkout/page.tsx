import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CheckoutReview } from "@/components/cart/checkout-review";
import styles from "@/components/cart/checkout-review.module.css";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[] }> }) {
  const params = await searchParams;
  const buyNow = params.mode === "buy-now";
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(buyNow ? "/checkout?mode=buy-now" : "/checkout")}`);
  }

  return (
    <main id="main" tabIndex={-1} className={styles.page}>
      <header className={styles.heading}><h1>Secure Checkout</h1><p>Complete your purchase in 4 easy steps</p></header>
      <CheckoutReview buyNow={buyNow} />
    </main>
  );
}
