import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CheckoutPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fcheckout");
  }

  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <p className="section-kicker">Checkout</p>
      <h1 className="auth-title">Order placement is not available yet</h1>
      <p className="auth-description">
        Shipping, GST totals, and payment setup are still being configured. No order or payment is started here.
      </p>
      <nav className="route-state-actions" aria-label="Continue shopping">
        <Link className="shell-button" href="/cart">Return to cart</Link>
        <Link className="site-link" href="/shop">Browse products</Link>
      </nav>
    </main>
  );
}
