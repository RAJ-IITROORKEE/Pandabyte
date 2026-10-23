import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function AccountPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

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
    <main className="auth-page">
      <p className="section-kicker">Account</p>
      <h1 className="auth-title">You’re signed in.</h1>
      <p className="auth-description">
        {identityVerified
          ? "Your account connection is verified."
          : "Your Clerk session is active, but we couldn’t verify the account data connection. Please try again later."}
      </p>
    </main>
  );
}
