"use client";

import { SignIn } from "@clerk/nextjs";
import { IconArrowRight, IconArrowUpRight, IconBox, IconFileText, IconLock } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { AdminThemeProvider, useAdminTheme } from "./admin-theme";
import styles from "./admin-login.module.css";

function LoginContent({ signedIn, fontFamily }: { signedIn: boolean; fontFamily: string }) {
  const { preference, resolvedTheme, setPreference, ready } = useAdminTheme();
  const dark = resolvedTheme === "dark";
  return <main className={styles.layout} id="main">
    <section className={styles.intro} aria-labelledby="admin-login-title">
      <Link href="/" className={styles.brand}><span><Image src="/brand/pandabyte-logo.png" alt="" width={36} height={36} /></span>PandaByte.in</Link>
      <div className={styles.introCopy}>
        <h1 id="admin-login-title">Your workspace.<br />Everything in order.</h1>
        <p>Manage PandaByte products, site content, and customer enquiries from one workspace.</p>
        <ul><li><IconBox aria-hidden="true" />Catalog &amp; media</li><li><IconFileText aria-hidden="true" />Content &amp; publishing</li><li><IconLock aria-hidden="true" />Role-based access</li></ul>
      </div>
      <p className={styles.note}>PandaByte Admin · Authorized staff only</p>
    </section>
    <section className={styles.signIn} aria-label="Admin sign in">
      <div className={styles.controls}>
        <Link href="/">Open storefront <IconArrowUpRight aria-hidden="true" size={15} /></Link>
        <label>Appearance<select value={preference} disabled={!ready} onChange={(event) => setPreference(event.target.value as "light" | "dark" | "system")}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      </div>
      <div className={styles.form}>
        {signedIn ? <><IconLock aria-hidden="true" size={28} /><h2>You’re signed in</h2><p>Continue to the Admin workspace. Access is checked against your current staff permissions.</p><Link className={styles.continue} href="/admin">Continue to Admin <IconArrowRight aria-hidden="true" size={17} /></Link></> : <>
          <h2>Welcome back</h2><p>Sign in with your PandaByte staff account.</p>
          <SignIn path="/admin-login" routing="path" forceRedirectUrl="/admin" appearance={{ variables: {
            fontFamily, borderRadius: "0.5rem", colorPrimary: dark ? "#006239" : "#72e3ad", colorPrimaryForeground: dark ? "#dde8e3" : "#1e2723",
            colorBackground: dark ? "#171717" : "#fcfcfc", colorForeground: dark ? "#e2e8f0" : "#171717",
            colorMutedForeground: dark ? "#b4b4b4" : "#525252", colorInput: dark ? "#121212" : "#ffffff",
            colorInputForeground: dark ? "#e2e8f0" : "#171717", colorBorder: dark ? "#292929" : "#dfdfdf",
          }, elements: { rootBox: { width: "100%" }, cardBox: { width: "100%", boxShadow: "none" }, formButtonPrimary: { backgroundColor: dark ? "#006239" : "#72e3ad", color: dark ? "#dde8e3" : "#1e2723", backgroundImage: "none", minHeight: "44px" } } }} />
        </>}
      </div>
      <p className={styles.security}>Identity secured by Clerk. Staff permissions are checked separately.</p>
    </section>
  </main>;
}

export function AdminLogin(props: { signedIn: boolean; fontFamily: string }) {
  return <AdminThemeProvider fontFamily={props.fontFamily}><LoginContent {...props} /></AdminThemeProvider>;
}
