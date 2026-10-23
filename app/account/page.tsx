import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  return (
    <main className="auth-page">
      <p className="section-kicker">Account</p>
      <h1 className="auth-title">You’re signed in.</h1>
      <p className="auth-description">
        Your Clerk session is active. Account data and commerce features will be
        available after the backend is connected.
      </p>
    </main>
  );
}
