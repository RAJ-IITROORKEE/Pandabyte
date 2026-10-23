import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { AccountDashboard } from "@/components/account-dashboard";
import styles from "@/components/account.module.css";

export default async function AccountPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main id="main" className={styles.accountPage} tabIndex={-1}>
      <Suspense fallback={<p className={styles.connectionMessage} role="status">Connecting to your account…</p>}>
        <AccountData userId={userId} />
      </Suspense>
    </main>
  );
}

async function AccountData({ userId }: { userId: string }) {
  let identityVerified = false;

  try {
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database
      .schema("public")
      .rpc("requesting_user_id");

    identityVerified = !error && data === userId;
  } catch {
    identityVerified = false;
  }

  return (
    <>
      {identityVerified
        ? <AccountDashboard />
        : <p className={styles.connectionError} role="alert">Your session is active, but we couldn’t verify the account data connection. Please try again later.</p>}
    </>
  );
}
