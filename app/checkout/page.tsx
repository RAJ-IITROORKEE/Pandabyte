import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function CheckoutPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fcheckout");
  }

  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <p className="section-kicker">Checkout</p>
      <h1 className="auth-title">Checkout is not connected yet</h1>
      <p className="auth-description">
        Your account is signed in, but ordering and payment are not available in this development build.
      </p>
    </main>
  );
}
