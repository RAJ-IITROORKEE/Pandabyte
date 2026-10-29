"use client";

import Link from "next/link";
import { Heart, MapPin, Package } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "@/components/account-dashboard.module.css";

type AddressSummary = { label: string; recipientName: string; line1: string; city: string; isDefaultShipping: boolean; isDefaultBilling: boolean };
type Summary = { addresses: AddressSummary[] | null; phone: string | null; activeCount: number | null };
export function AccountOverviewExtras({ userId, favoritesLabel }: { userId: string; favoritesLabel: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    let controller: AbortController;
    async function get(path: string, signal: AbortSignal): Promise<unknown> {
      const response = await fetch(path, { cache: "no-store", signal });
      if (!response.ok) throw new Error();
      return response.json();
    }
    function load() {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      void Promise.allSettled([get("/api/account/addresses", signal), get("/api/account/profile", signal), get("/api/account/orders?limit=10&offset=0&q=&status=active", signal)]).then(results => {
        if (signal.aborted) return;
        const [addresses, profile, orders] = results.map(result => result.status === "fulfilled" ? result.value : null);
        const addressData = addresses && typeof addresses === "object" && "addresses" in addresses && Array.isArray(addresses.addresses) && addresses.addresses.every((item: unknown) => item && typeof item === "object" && ["label", "recipientName", "line1", "city"].every(key => typeof (item as Record<string, unknown>)[key] === "string") && typeof (item as AddressSummary).isDefaultShipping === "boolean" && typeof (item as AddressSummary).isDefaultBilling === "boolean") ? addresses.addresses as AddressSummary[] : null;
        const phoneData = profile && typeof profile === "object" && "profile" in profile && profile.profile === null ? "" : profile && typeof profile === "object" && "profile" in profile && profile.profile && typeof profile.profile === "object" && "phone" in profile.profile && typeof profile.profile.phone === "string" ? profile.profile.phone : null;
        const activeData = orders && typeof orders === "object" && "total" in orders && Number.isSafeInteger(orders.total) && Number(orders.total) >= 0 ? Number(orders.total) : null;
        setSummary({ addresses: addressData, phone: phoneData, activeCount: activeData });
      });
    }
    load(); window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [userId]);
  const shipping = summary?.addresses?.find(address => address.isDefaultShipping);
  const billing = summary?.addresses?.find(address => address.isDefaultBilling);
  const addressText = (address?: AddressSummary) => address ? `${address.recipientName} · ${address.line1}, ${address.city}` : "No default address selected.";
  return <>
    <div className={styles.shortcuts}>
      <Link href="/account/orders"><Package size={20} aria-hidden="true" /><strong>{!summary ? "Loading active orders…" : summary.activeCount === null ? "Active orders unavailable" : `${summary.activeCount} active ${summary.activeCount === 1 ? "order" : "orders"}`}</strong><span>View order activity</span></Link>
      <Link href="/account/favorites"><Heart size={20} aria-hidden="true" /><strong>{favoritesLabel}</strong><span>Saved to your account</span></Link>
      <Link href="/account/addresses"><MapPin size={20} aria-hidden="true" /><strong>{!summary ? "Loading addresses…" : !summary.addresses ? "Addresses unavailable" : `${summary.addresses.length} saved ${summary.addresses.length === 1 ? "address" : "addresses"}`}</strong><span>Manage shipping and billing</span></Link>
    </div>
    <section className={styles.panel} aria-labelledby="overview-address-heading"><h2 id="overview-address-heading">Addresses</h2>
      {!summary ? <p role="status">Loading address summary…</p> : !summary.addresses ? <p>Address summary is unavailable.</p> : <><p>{summary.addresses.length} saved {summary.addresses.length === 1 ? "address" : "addresses"}.</p><p><strong>Shipping:</strong> {addressText(shipping)}</p><p><strong>Billing:</strong> {addressText(billing)}</p></>}
      <Link href="/account/addresses">Manage addresses</Link>
    </section>
    <section className={styles.panel} aria-labelledby="overview-contact-heading"><h2 id="overview-contact-heading">Contact and order activity</h2>
      {!summary ? <p role="status">Loading account summary…</p> : <><p>Contact phone: {summary.phone === null ? "Unavailable" : summary.phone || "Not set"}{summary.phone ? " (unverified)" : ""}</p><p>{summary.activeCount === null ? "Active order count unavailable." : `${summary.activeCount} active ${summary.activeCount === 1 ? "order" : "orders"}.`}</p></>}
      <p>Order activity includes development test and simulated orders.</p>
      <Link href="/account/profile">Edit contact details</Link>
    </section>
  </>;
}
