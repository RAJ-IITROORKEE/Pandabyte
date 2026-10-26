"use client";

import { Suspense } from "react";
import { UserAvatar, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ChevronDown, FolderLock, Settings } from "lucide-react";
import { AccountProfile } from "@/components/account-profile";
import { AccountFiles } from "@/components/account-files";
import { AccountAddresses } from "@/components/account-addresses";
import styles from "@/components/account.module.css";

export function AccountDashboard() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return <p className={styles.loadingState} role="status">Loading your account…</p>;
  }

  if (!user) {
    return <p className={styles.errorState} role="alert">Your account details could not be loaded. Refresh the page or sign in again.</p>;
  }

  const name = user.fullName?.trim() || user.firstName?.trim() || "Your account";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardHeader}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            <UserAvatar rounded appearance={{ elements: { avatarBox: styles.avatarBox, avatarImage: styles.avatarImage } }} />
          </span>
          <div>
            <p className={styles.eyebrow}>My account</p>
            <h1>{name}</h1>
            {email && <p className={styles.email}>{email}</p>}
          </div>
        </div>
        <Link className={styles.settingsLink} href="/account/settings">
          <Settings aria-hidden="true" size={17} />
          Settings
        </Link>
      </div>

      <AccountProfile />

      <AccountAddresses />

      <details className={styles.moreDetails}>
        <summary>
          <span className={styles.sectionIcon}><FolderLock aria-hidden="true" size={19} /></span>
          <span className={styles.summaryText}><strong>Private account files</strong><small>Manage files saved to your account.</small></span>
          <ChevronDown className={styles.summaryChevron} aria-hidden="true" size={19} />
        </summary>
        <div className={styles.detailContent}>
          <Suspense fallback={<p className={styles.loadingState} role="status">Loading account files…</p>}>
            <AccountFiles />
          </Suspense>
        </div>
      </details>
    </div>
  );
}
