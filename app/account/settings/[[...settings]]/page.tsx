import { UserProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import styles from "@/components/account.module.css";
import { authEntryHref } from "@/lib/auth/return-path";
import { foundationPages } from "@/lib/site-navigation";

type AccountSettingsPageProps = {
  params: Promise<{ settings?: string[] }>;
};

export default async function AccountSettingsPage({ params }: AccountSettingsPageProps) {
  const { settings = [] } = await params;
  const returnPath = `/account/settings${settings.map((segment) => `/${encodeURIComponent(segment)}`).join("")}`;
  const { isAuthenticated, sessionStatus } = await auth();
  if (!isAuthenticated || sessionStatus !== "active") {
    redirect(authEntryHref("sign-in", returnPath, Object.keys(foundationPages)));
  }

  return (
    <main id="main" className={styles.settingsPage} tabIndex={-1}>
      <Link className={styles.backLink} href="/account">
        <span aria-hidden="true">←</span> Back to account
      </Link>
      <p className={styles.eyebrow}>Account</p>
      <h1>Settings</h1>
      <p className={styles.settingsIntro}>
        Manage your profile name, avatar, and sign-in details here. Contact details and shipping or billing addresses are available on your account dashboard.
      </p>
      <Suspense fallback={<p className={styles.loadingState} role="status">Loading your profile settings…</p>}>
        <UserProfile path="/account/settings" routing="path" appearance={{ elements: { rootBox: styles.clerkProfile } }} />
      </Suspense>
    </main>
  );
}
