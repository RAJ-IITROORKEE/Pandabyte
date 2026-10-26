import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicPage } from "@/components/storefront/page-frame";
import styles from "@/components/cart/cart.module.css";

export default async function CheckoutPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fcheckout");
  }

  return (
    <PublicPage title="Checkout" description="Review your cart before placing an order.">
      <section className={styles.checkoutNotice} aria-labelledby="checkout-unavailable">
        <h2 id="checkout-unavailable">Order placement is not available yet</h2>
        <p>
          Shipping, GST totals, and payment setup are still being configured. No order or payment is started here.
        </p>
        <nav className="route-state-actions" aria-label="Continue shopping">
          <Link className="shell-button" href="/cart">Return to cart</Link>
          <Link className="site-link" href="/shop">Browse products</Link>
        </nav>
      </section>
    </PublicPage>
  );
}
