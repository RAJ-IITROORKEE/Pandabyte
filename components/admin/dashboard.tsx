"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import styles from "./admin-ui.module.css";

const countable = [
  { module: "products", label: "Products", capability: "catalog.edit" },
  { module: "categories", label: "Categories", capability: "catalog.edit" },
  { module: "blog", label: "Blog posts", capability: "content.edit" },
  { module: "pages", label: "Pages", capability: "content.edit" },
  { module: "faqs", label: "FAQs", capability: "content.edit" },
  { module: "media", label: "Media assets", capability: "media.manage" },
  { module: "inquiries", label: "Inquiries", capability: "inquiries.manage" },
] as const;

type Count = { value: number | null };

export function AdminDashboard() {
  const capabilities = useAdminCapabilities();
  const visible = useMemo(() => countable.filter((item) => capabilities.includes(item.capability)), [capabilities]);
  const [counts, setCounts] = useState<Record<string, Count>>({});
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all(visible.map(async (item) => {
      try {
        const response = await fetch(`/api/admin/${item.module}?limit=1&offset=0`, { cache: "no-store" });
        const body = await response.json() as { total?: unknown; error?: { message?: string } };
        if (!response.ok || !Number.isSafeInteger(body.total) || (body.total as number) < 0) throw new Error(body.error?.message || "Count could not be loaded.");
        return [item.module, { value: body.total as number }] as const;
      } catch {
        return [item.module, { value: null }] as const;
      }
    })).then((results) => { if (active) setCounts(Object.fromEntries(results)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, visible]);

  return <div className={styles.screen}>
    <div className={styles.pageHeading}>
      <div><p className={styles.eyebrow}>Pandabyte.in</p><h1>Admin workspace</h1><p className={styles.lede}>Manage the catalog, site content, media, and customer inquiries.</p></div>
      <button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} disabled={loading}><RefreshCw aria-hidden="true" size={15} /> Refresh counts</button>
    </div>
    <section className={styles.dashboardPanel} aria-labelledby="records-heading">
      <div className={styles.sectionHeading}><div><h2 id="records-heading">Available records</h2><p>Counts reflect the records you can access.</p></div></div>
      {visible.length === 0 ? <p className={styles.fieldHint}>No workspace areas are available for your role.</p> : <div className={styles.metricGrid} aria-live="polite">
        {visible.map((item) => <article className={styles.metricCard} key={item.module}>
          <p>{item.label}</p>
          <strong>{counts[item.module]?.value ?? (loading ? "…" : "Unavailable")}</strong>
          <Link href={`/admin/${item.module}`}>Open {item.label.toLowerCase()} <ArrowRight aria-hidden="true" size={14} /></Link>
        </article>)}
      </div>}
    </section>
    <section className={styles.dashboardPanel} aria-labelledby="work-heading">
      <div className={styles.sectionHeading}><div><h2 id="work-heading">Your access</h2><p>Your role determines which areas appear here.</p></div></div>
      <div className={styles.dashboardLinks}>
        {capabilities.includes("catalog.edit") && <Link href="/admin/pricing">Pricing <ArrowRight size={15} aria-hidden="true" /></Link>}
        {capabilities.includes("orders.manage") && <Link href="/admin/inventory">Inventory <ArrowRight size={15} aria-hidden="true" /></Link>}
        {capabilities.includes("media.manage") && <Link href="/admin/media">Media library <ArrowRight size={15} aria-hidden="true" /></Link>}
        {capabilities.includes("inquiries.manage") && <Link href="/admin/inquiries">Inquiries <ArrowRight size={15} aria-hidden="true" /></Link>}
        {capabilities.includes("staff.manage") && <Link href="/admin/users">Staff access <ArrowRight size={15} aria-hidden="true" /></Link>}
      </div>
      {capabilities.includes("orders.manage") && <p className={styles.phaseNote}>Order management is not available yet.</p>}
    </section>
  </div>;
}
