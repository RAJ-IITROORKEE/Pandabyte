import { UserProfile } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountProfile } from "@/components/account-profile";
import { AccountShell } from "@/components/account-dashboard";
import { ThemePreference } from "@/components/theme-preference";
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
    <main id="main" className={styles.accountPage} tabIndex={-1}>
      <AccountShell activeSection="settings">
      <div className={styles.settingsPage}>
      <p className={styles.eyebrow}>Account</p>
      <h1>Settings</h1>
      <p className={styles.settingsIntro}>
        Manage your profile name, avatar, sign-in and contact details here. Shipping and billing addresses are available on your account dashboard.
      </p>
      <Suspense fallback={<p className={styles.loadingState} role="status">Loading your profile settings…</p>}>
        <UserProfile path="/account/settings" routing="path" appearance={{ elements: { rootBox: styles.clerkProfile } }} />
      </Suspense>
      <AccountProfile />
      <section aria-labelledby="notification-settings-heading">
        <h2 id="notification-settings-heading">Notifications</h2>
        <p className={styles.settingsIntro}>Notification preferences will be available when order and billing notifications are supported.</p>
      </section>
      <ThemePreference />
      </div>
      </AccountShell>
    </main>
  );
}
