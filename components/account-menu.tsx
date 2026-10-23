"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Settings, ShoppingBag } from "lucide-react";
import styles from "@/components/account-menu.module.css";

export function AccountMenu() {
  const pathname = usePathname();
  return <AccountMenuContent key={pathname} />;
}

function AccountMenuContent() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  if (!isLoaded) return <span className={styles.loading} aria-hidden="true" />;
  if (!user) return null;

  const displayName = user.fullName?.trim() || user.firstName?.trim() || "Your account";
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setSigningOut(false);
      setSignOutError("Could not sign you out. Please try again.");
    }
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        aria-controls={open ? "pb-account-menu" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.avatar} aria-hidden="true">
          <UserAvatar rounded />
        </span>
        <span className={styles.name}>{displayName}</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>

      {open && (
        <div id="pb-account-menu" className={styles.panel} aria-label="Account menu">
          <div className={styles.identity}>
            <span className={styles.identityName}>{displayName}</span>
            {email && <span className={styles.identityEmail}>{email}</span>}
          </div>
          <nav className={styles.items} aria-label="Account">
            <Link className={styles.item} href="/account" onClick={close}>
              <LayoutDashboard aria-hidden="true" />
              <span>Dashboard</span>
            </Link>
            <Link className={styles.item} href="/shop" onClick={close}>
              <ShoppingBag aria-hidden="true" />
              <span>Shop</span>
            </Link>
            <Link className={styles.item} href="/account/settings" onClick={close}>
              <Settings aria-hidden="true" />
              <span>Settings</span>
            </Link>
          </nav>
          {signOutError && <p className={styles.signOutError} role="alert">{signOutError}</p>}
          <button
            className={styles.logout}
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            <LogOut aria-hidden="true" />
            <span>{signingOut ? "Signing out…" : "Logout"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
