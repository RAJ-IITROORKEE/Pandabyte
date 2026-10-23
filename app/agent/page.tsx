import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function AgentPage() {
  const { isAuthenticated, sessionStatus, userId } = await auth();

  if (!isAuthenticated || sessionStatus !== "active" || !userId) {
    redirect("/sign-in?redirect_url=%2Fagent");
  }

  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <p className="section-kicker">PandaByte Agent</p>
      <h1 className="auth-title">Coming soon</h1>
      <p className="auth-description">No release date or availability is announced.</p>
    </main>
  );
}
