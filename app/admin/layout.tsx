import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getStaffAccess } from "@/lib/authorization";
import { adminFont } from "@/components/admin/admin-font";
import { AdminThemeProvider } from "@/components/admin/admin-theme";
import styles from "@/components/admin/admin-login.module.css";

export default async function AdminLayout(props: LayoutProps<"/admin">) {
  const access = await getStaffAccess();

  if (!access.allowed) {
    if (access.status === 401) redirect("/admin-login");

    return (
      <AdminThemeProvider fontFamily={adminFont.style.fontFamily}><main className={styles.access}>
        <h1>{access.status === 403 ? "Access denied" : "Staff access is unavailable."}</h1>
        <p>
          {access.status === 403
            ? "You don’t have access to the admin workspace."
            : "Please try again later."}
        </p>
      </main></AdminThemeProvider>
    );
  }

  return <AdminShell capabilities={access.capabilities} fontFamily={adminFont.style.fontFamily}>{props.children}</AdminShell>;
}
