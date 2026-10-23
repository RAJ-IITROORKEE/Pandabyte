import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { AccountProfile } from "@/components/account-profile";
import { AccountFiles } from "@/components/account-files";

export default async function AccountPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main id="main" className="auth-page account-layout" tabIndex={-1}>
      <p className="section-kicker">Account</p>
      <h1 className="auth-title">You’re signed in.</h1>
      <Suspense fallback={<p className="auth-description" role="status">Connecting to your account…</p>}>
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
      <p className="auth-description">
        {identityVerified
          ? "Your account connection is verified."
          : "Your Clerk session is active, but we couldn’t verify the account data connection. Please try again later."}
      </p>
      {identityVerified && (
        <div className="account-sections">
          <AccountProfile />
          <AccountFiles />
        </div>
      )}
    </>
  );
}
