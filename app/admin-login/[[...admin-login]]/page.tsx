import { auth } from "@clerk/nextjs/server";
import { AdminLogin } from "@/components/admin/admin-login";
import { adminFont } from "@/components/admin/admin-font";

export default async function AdminLoginPage() {
  const { isAuthenticated } = await auth();
  return <AdminLogin signedIn={isAuthenticated} fontFamily={adminFont.style.fontFamily} />;
}
