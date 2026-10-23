import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getStaffAccess } from "@/lib/authorization";

export default async function AdminLayout(props: LayoutProps<"/admin">) {
  const access = await getStaffAccess();

  if (!access.allowed) {
    if (access.status === 401) redirect("/sign-in?redirect_url=%2Fadmin");

    return (
      <main className="auth-page">
        <h1 className="auth-title">{access.status === 403 ? "Access denied" : "Staff access is unavailable."}</h1>
        <p className="auth-description">
          {access.status === 403
            ? "You don’t have access to the admin workspace."
            : "Please try again later."}
        </p>
      </main>
    );
  }

  return <AdminShell capabilities={access.capabilities}>{props.children}</AdminShell>;
}
