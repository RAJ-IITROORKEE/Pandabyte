"use client";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { CreditCard, FolderLock, Heart, LayoutDashboard, LogOut, MapPin, Package, Settings, UserRound } from "lucide-react";
import { AccountFiles } from "@/components/account-files";
import { AccountAddresses } from "@/components/account-addresses";
import { AccountProfile } from "@/components/account-profile";
import { AccountBilling } from "@/components/account-billing";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { useFavorites } from "@/components/favorites/use-favorites";
import { AccountOrders, useAccountOrders } from "@/components/account-orders";
import styles from "@/components/account-dashboard.module.css";

export type AccountSection = "overview" | "profile" | "addresses" | "favorites" | "orders" | "billing" | "files";
const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/account" },
  { id: "profile", label: "Profile", icon: UserRound, href: "/account/profile" },
  { id: "addresses", label: "Addresses", icon: MapPin, href: "/account/addresses" },
  { id: "favorites", label: "Favorites", icon: Heart, href: "/account/favorites" },
  { id: "orders", label: "Orders", icon: Package, href: "/account/orders" },
  { id: "billing", label: "Billing & Invoices", icon: CreditCard, href: "/account/billing" },
  { id: "files", label: "Private files", icon: FolderLock, href: "/account/files" },
] as const;

export function AccountDashboard({ section = "overview" }: { section?: AccountSection }) {
  useEffect(() => {
    if (section !== "overview") return;
    const redirectHash = () => {
      const match = sections.find(item => item.id !== "overview" && `#${item.id}` === window.location.hash);
      if (match) window.location.replace(match.href);
    };
    redirectHash();
    window.addEventListener("hashchange", redirectHash);
    return () => window.removeEventListener("hashchange", redirectHash);
  }, [section]);
  return <AccountShell activeSection={section}>
    <div className={styles.content}>
      {section === "overview" && <AccountOverview />}
      {section === "profile" && <AccountProfile />}
      {section === "addresses" && <><header className={styles.pageHeading}><h1>Addresses</h1><p>Manage your saved shipping and billing addresses.</p></header><AccountAddresses /></>}
      {section === "favorites" && <section className={styles.panel}><h1>Favorites</h1><p>Products saved to your account.</p><FavoritesList /></section>}
      {section === "orders" && <OrdersPage />}
      {section === "billing" && <AccountBilling />}
      {section === "files" && <section className={styles.panel}><h1>Private account files</h1><Suspense fallback={<p role="status">Loading account files…</p>}><AccountFiles /></Suspense></section>}
    </div>
  </AccountShell>;
}

function OrdersPage() {
  const { user } = useUser();
  const data = useAccountOrders(user?.id);
  return <AccountOrders data={data} />;
}
function AccountOverview() {
  const { user } = useUser();
  const favorites = useFavorites();
  const orders = useAccountOrders(user?.id);
  const greeting = user?.firstName?.trim() || user?.fullName?.trim();
  return <>
    <header className={styles.overview}><h1>{greeting ? `Hello, ${greeting}` : "Welcome to your account"}</h1><p>Manage your profile, addresses and saved products in one place.</p><Link href="/shop">Explore the shop <span aria-hidden="true">→</span></Link></header>
    <section className={styles.panel}><h2>Favorites</h2><Link href="/account/favorites">{favorites.loading ? "Loading favorites…" : favorites.items == null ? "Favorites unavailable" : `${favorites.items.length} saved products`}</Link></section>
    <section className={styles.panel}><h2>Recent orders</h2>{orders.error ? <p>{orders.error}</p> : !orders.orders ? <p role="status">Loading orders…</p> : orders.orders.items.length ? <ul>{orders.orders.items.slice(0, 3).map(order => <li key={order.reference}><Link href={`/checkout/confirmation/${encodeURIComponent(order.reference)}`}>{order.reference}</Link> · {order.status}</li>)}</ul> : <p>No orders yet. Your purchases will appear here.</p>}</section>
    <section className={styles.panel}><h2>Profile</h2><p>{user?.fullName || "Your account"}{user?.primaryEmailAddress?.emailAddress ? ` · ${user.primaryEmailAddress.emailAddress}` : ""}</p><Link href="/account/profile">Edit profile</Link></section>
  </>;
}

export function AccountShell({ activeSection, children }: { activeSection: AccountSection | "settings"; children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [signOutError, setSignOutError] = useState("");
  async function handleSignOut() {
    setSignOutError("");
    try { await signOut({ redirectUrl: "/" }); }
    catch { setSignOutError("Could not sign you out. Please try again."); }
  }
  if (!isLoaded) return <p className={styles.message} role="status">Loading your account…</p>;
  if (!user) return <p className={styles.message} role="alert">Your account details could not be loaded. Refresh the page or sign in again.</p>;
  const name = user.fullName?.trim() || user.firstName?.trim() || "Your account";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const navigation = <nav className={styles.navigation} aria-label="Account sections">
    {sections.map(({ id, label, icon: Icon, href }) => <Link key={id} href={href} aria-current={activeSection === id ? "page" : undefined}><Icon size={18} aria-hidden="true" />{label}</Link>)}
    <Link href="/account/settings" aria-current={activeSection === "settings" ? "page" : undefined}><Settings size={18} aria-hidden="true" />Settings</Link>
  </nav>;
  return <div key={user.id} className={styles.dashboard}>
    <aside className={styles.sidebar}>
      <div className={styles.identity}><span className={styles.avatar} aria-hidden="true"><UserAvatar rounded appearance={{ elements: { avatarBox: styles.avatarBox, avatarImage: styles.avatarImage } }} /></span><div><strong>{name}</strong>{email && <span>{email}</span>}</div></div>
      <details className={styles.mobileNavigation}><summary>Account navigation · {activeSection === "settings" ? "Settings" : sections.find(item => item.id === activeSection)?.label}</summary>{navigation}</details>
      <div className={styles.desktopNavigation}>{navigation}</div>
      <div className={styles.sidebarActions}><button type="button" onClick={() => void handleSignOut()}><LogOut size={18} aria-hidden="true" />Log out</button>{signOutError && <p role="alert">{signOutError}</p>}</div>
    </aside>
    {children}
  </div>;
}
