"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { UserAvatar, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { CreditCard, FolderLock, Heart, LayoutDashboard, LogOut, MapPin, Package, Settings, UserRound } from "lucide-react";
import { AccountProfile } from "@/components/account-profile";
import { AccountFiles } from "@/components/account-files";
import { AccountAddresses } from "@/components/account-addresses";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { useFavorites } from "@/components/favorites/use-favorites";
import { AccountOrders, useAccountOrders } from "@/components/account-orders";
import styles from "@/components/account-dashboard.module.css";

const sections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "addresses", label: "Addresses", icon: MapPin },
  { id: "favorites", label: "Favorites", icon: Heart },
  { id: "orders", label: "Orders", icon: Package },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "files", label: "Private files", icon: FolderLock },
];

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function AccountDashboard() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [signOutError, setSignOutError] = useState("");
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash.slice(1), () => "");
  const favorites = useFavorites();
  const favoriteCount = favorites.items?.length;
  const orderData = useAccountOrders(user?.id);
  const activeSection = sections.some((section) => section.id === hash) ? hash : "overview";
  useEffect(() => {
    if (isLoaded && user && sections.some(section => section.id === hash)) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [hash, isLoaded, user]);

  async function handleSignOut() {
    setSignOutError("");
    try {
      await signOut({ redirectUrl: "/" });
    } catch {
      setSignOutError("Could not sign you out. Please try again.");
    }
  }

  if (!isLoaded) return <p className={styles.message} role="status">Loading your account…</p>;
  if (!user) return <p className={styles.message} role="alert">Your account details could not be loaded. Refresh the page or sign in again.</p>;

  const name = user.fullName?.trim() || user.firstName?.trim() || "Your account";
  const greeting = user.firstName?.trim() || user.fullName?.trim();
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div key={user.id} className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true"><UserAvatar rounded appearance={{ elements: { avatarBox: styles.avatarBox, avatarImage: styles.avatarImage } }} /></span>
          <div><strong>{name}</strong>{email && <span>{email}</span>}</div>
        </div>
        <nav className={styles.navigation} aria-label="Account sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>
              <Icon size={18} aria-hidden="true" />{label}
            </a>
          ))}
        </nav>
        <div className={styles.sidebarActions}>
          <Link href="/account/settings"><Settings size={18} aria-hidden="true" />Settings</Link>
          <button type="button" onClick={() => void handleSignOut()}><LogOut size={18} aria-hidden="true" />Log out</button>
          {signOutError && <p role="alert">{signOutError}</p>}
        </div>
      </aside>

      <div className={styles.content}>
        <header id="overview" className={styles.overview}>
          <p className={styles.eyebrow}>My account</p>
          <h1>{greeting ? `Hello, ${greeting}` : "Welcome to your account"}</h1>
          <p>Manage your profile, addresses and saved products in one place.</p>
          <Link href="/shop">Explore the shop <span aria-hidden="true">→</span></Link>
        </header>

        <div className={styles.shortcuts}>
          <a href="#favorites"><Heart aria-hidden="true" size={20} /><strong>{favoriteCount === undefined ? "Favorites unavailable" : `${favoriteCount} saved products`}</strong><span>{favorites.account ? "Saved to your account" : "Saved in this browser"}</span></a>
          <a href="#addresses"><MapPin aria-hidden="true" size={20} /><strong>Address book</strong><span>Manage delivery and billing addresses</span></a>
          <a href="#orders"><Package aria-hidden="true" size={20} /><strong>{orderData.orders ? `${orderData.orders.total} orders` : "Order activity"}</strong><span>{orderData.error ? "Orders unavailable" : "View order history"}</span></a>
        </div>

        <section id="profile" aria-label="Profile">
          <AccountProfile />
          <p className={styles.identityNote}>Manage your name, email and profile photo in <Link href="/account/settings">account settings</Link>.</p>
        </section>
        <section id="addresses" aria-label="Addresses"><AccountAddresses /></section>
        <section id="favorites" className={styles.panel} aria-labelledby="favorites-heading">
          <h2 id="favorites-heading">Favorites</h2>
          <p>{favorites.account ? "Products saved to your account." : "Products saved on this browser."}</p>
          <FavoritesList />
        </section>
        <section id="orders" className={styles.panel} aria-labelledby="orders-heading">
          <h2 id="orders-heading">Orders</h2>
          <AccountOrders data={orderData} />
        </section>
        <section id="billing" className={styles.panel} aria-labelledby="billing-heading">
          <h2 id="billing-heading">Billing</h2>
          <p>Billing history is not available yet.</p>
        </section>
        <section id="files" className={styles.panel} aria-labelledby="files-heading">
          <h2 id="files-heading">Private account files</h2>
          <p>Manage files saved to your account.</p>
          <Suspense fallback={<p role="status">Loading account files…</p>}><AccountFiles /></Suspense>
        </section>
      </div>
    </div>
  );
}
