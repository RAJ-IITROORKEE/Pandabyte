import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authorization";

export default async function StaffPage() {
  const access = await requireCapability("content.edit");

  if (!access.allowed && access.status === 401) {
    redirect("/sign-in?redirect_url=%2Faccount");
  }

  if (!access.allowed && access.status === 403) {
    return (
      <main className="auth-page">
        <h1 className="auth-title">Forbidden</h1>
        <p className="auth-description">You don’t have access to staff tools.</p>
      </main>
    );
  }

  if (!access.allowed) {
    return (
      <main className="auth-page">
        <h1 className="auth-title">Staff access is unavailable.</h1>
        <p className="auth-description">Please try again later.</p>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <p className="section-kicker">Staff</p>
      <h1 className="auth-title">Staff access confirmed.</h1>
      <p className="auth-description">
        Authorized capability: <code>content.edit</code>.
      </p>
    </main>
  );
}
