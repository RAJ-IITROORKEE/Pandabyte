import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { guideAdminAccess } from "@/Panda-agent/src/server/guide-admin";
import { AdminThemeProvider } from "@/components/admin/admin-theme";
import { adminFont } from "@/components/admin/admin-font";
import { DocumentationPanel } from "./documentation-panel";
import styles from "./documentation.module.css";

export default async function DocumentationPage() {
  const access = await guideAdminAccess();
  if (!access.allowed && access.status === 401) redirect("/sign-in?redirect_url=%2Fpanda-agent%2Fdocumentation");
  return <AdminThemeProvider fontFamily={adminFont.style.fontFamily}><main id="main" className={styles.screen}>
    <header className={styles.header}><Link href="/panda-agent" className={styles.brand}><Image src="/brand/pandabyte-logo.png" width={40} height={40} alt="PandaByte" /><span>Panda Agent</span></Link><Link href="/panda-agent">Back to chat</Link></header>
    {access.allowed ? <><h1>Vendor documentation</h1><p>Review scoped versions and the separate vendor search tool.</p><DocumentationPanel /></> : <><h1>{access.status === 403 ? "Access denied" : "Agent administration is unavailable"}</h1><p>{access.status === 403 ? "An active administrator membership is required." : "Please try again later."}</p></>}
  </main></AdminThemeProvider>;
}
