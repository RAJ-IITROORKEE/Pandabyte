"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar, useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Settings, ShieldCheck, ShoppingBag } from "lucide-react";
import styles from "@/components/account-menu.module.css";

export function AccountMenu() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded) return <span className={styles.loading} aria-hidden="true" />;
  if (!isSignedIn || !userId || !sessionId) return null;
  return <AccountMenuSession key={`${userId}:${sessionId}`} userId={userId} />;
}

type WorkspaceAccess = { allowed: boolean | null; error: boolean };

function AccountMenuSession({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [access, setAccess] = useState<WorkspaceAccess>({ allowed: null, error: false });
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    void (async () => {
      try {
        const response = await fetch("/api/admin/access", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        let allowed: boolean;
        if (response.status === 401 || response.status === 403) allowed = false;
        else {
          if (!response.ok) throw new Error("Workspace access unavailable");
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("capabilities" in body) ||
            !Array.isArray(body.capabilities) || !body.capabilities.every((value) => typeof value === "string" && value.length > 0)) {
            throw new Error("Invalid workspace access response");
          }
          allowed = body.capabilities.length > 0;
        }
        if (!controller.signal.aborted) setAccess({ allowed, error: false });
      } catch {
        // A failed refresh is not a role revocation; all Admin routes still authorize on the server.
        if (!controller.signal.aborted) setAccess((current) => ({ ...current, error: true }));
      } finally {
        if (request.current === controller) request.current = null;
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      request.current?.abort();
      request.current = null;
    };
  }, [refresh]);

  return <AccountMenuContent key={pathname} userId={userId} access={access} refresh={refresh} />;
}

function AccountMenuContent({ userId, access, refresh }: {
  userId: string;
  access: WorkspaceAccess;
  refresh: () => void;
}) {
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
  if (!user || user.id !== userId) return null;

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
        onClick={() => {
          if (!open) refresh();
          setOpen((current) => !current);
        }}
      >
        <span className={styles.avatar} aria-hidden="true">
          <UserAvatar rounded appearance={{ elements: { avatarBox: styles.avatarBox, avatarImage: styles.avatarImage } }} />
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
            {access.allowed && <Link className={styles.item} href="/admin" onClick={close}>
              <ShieldCheck aria-hidden="true" />
              <span>Admin workspace</span>
            </Link>}
            {access.allowed === null && !access.error && <p className={styles.accessNotice} role="status">Checking workspace access…</p>}
            {access.error && <div className={styles.accessNotice}>
              <p role="status">Workspace access could not be refreshed.</p>
              <button className={styles.retry} type="button" onClick={refresh}>Retry access check</button>
            </div>}
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
