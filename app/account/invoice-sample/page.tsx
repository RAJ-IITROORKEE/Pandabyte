import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { AccountInvoiceSample } from "@/components/account-invoice-sample";
import styles from "@/components/account.module.css";

export default async function InvoiceSamplePage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();
  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/account/invoice-sample")}`);
  }
  let identityVerified = false;
  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.schema("public").rpc("requesting_user_id");
    identityVerified = !error && data === userId;
  } catch { identityVerified = false; }
  return <main id="main" tabIndex={-1}>
    {identityVerified ? <AccountInvoiceSample /> : <p className={styles.connectionError} role="alert">Your session is active, but we couldn’t verify the account data connection. Please try again later.</p>}
  </main>;
}
