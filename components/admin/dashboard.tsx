"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconArrowRight,
  IconCategory,
  IconMessageCircle,
  IconPackages,
  IconPhoto,
  IconRefresh,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import styles from "./dashboard.module.css";

const countable = [
  { module: "products", label: "Products", shortLabel: "Products", capability: "catalog.edit" },
  { module: "categories", label: "Categories", shortLabel: "Categories", capability: "catalog.edit" },
  { module: "blog", label: "Blog posts", shortLabel: "Blog", capability: "content.edit" },
  { module: "pages", label: "Pages", shortLabel: "Pages", capability: "content.edit" },
  { module: "faqs", label: "FAQs", shortLabel: "FAQs", capability: "content.edit" },
  { module: "media", label: "Media assets", shortLabel: "Media", capability: "media.manage" },
  { module: "inquiries", label: "Inquiries", shortLabel: "Inquiries", capability: "inquiries.manage" },
] as const;

const summaryItems = [
  { module: "products", label: "Products", href: "/admin/products", Icon: IconPackages },
  { module: "categories", label: "Categories", href: "/admin/categories", Icon: IconCategory },
  { module: "media", label: "Media assets", href: "/admin/media", Icon: IconPhoto },
  { module: "inquiries", label: "Inquiries", href: "/admin/inquiries", Icon: IconMessageCircle },
] as const;

type CountValue = number | null;

const accessLinks = [
  { capability: "catalog.edit", links: [{ label: "Products", href: "/admin/products" }, { label: "Categories", href: "/admin/categories" }, { label: "Pricing", href: "/admin/pricing" }] },
  { capability: "content.edit", links: [{ label: "Blog", href: "/admin/blog" }, { label: "Pages", href: "/admin/pages" }, { label: "FAQs", href: "/admin/faqs" }] },
  { capability: "media.manage", links: [{ label: "Media library", href: "/admin/media" }] },
  { capability: "inquiries.manage", links: [{ label: "Inquiries", href: "/admin/inquiries" }] },
  { capability: "orders.manage", links: [{ label: "Inventory", href: "/admin/inventory" }] },
  { capability: "staff.manage", links: [{ label: "Staff access", href: "/admin/users" }] },
] as const;

export function AdminDashboard() {
  const capabilities = useAdminCapabilities();
  const visible = useMemo(() => countable.filter((item) => capabilities.includes(item.capability)), [capabilities]);
  const summaries = summaryItems.filter((item) => visible.some((count) => count.module === item.module));
  const links = accessLinks.filter((group) => capabilities.includes(group.capability));
  const [counts, setCounts] = useState<Record<string, CountValue> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all(visible.map(async (item) => {
      try {
        const response = await fetch(`/api/admin/${item.module}?limit=1&offset=0`, { cache: "no-store" });
        const body = await response.json() as { total?: unknown };
        if (!response.ok || !Number.isSafeInteger(body.total) || (body.total as number) < 0) throw new Error("Count unavailable");
        return [item.module, body.total as number] as const;
      } catch {
        return [item.module, null] as const;
      }
    })).then((results) => { if (active) setCounts(Object.fromEntries(results)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, visible]);

  const chartRows = visible.map((item) => ({
    label: item.label,
    shortLabel: item.shortLabel,
    count: counts?.[item.module] ?? null,
  }));
  const chartData = chartRows.filter((row): row is typeof row & { count: number } => row.count !== null);
  const failed = !loading && chartRows.some((row) => row.count === null);
  const hasRecords = chartData.some((row) => row.count > 0);

  return (
    <div className={styles.dashboard}>
      <p className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">
        {loading ? "Loading record counts…" : failed ? "Some record counts could not be loaded." : "Record counts loaded."}
      </p>
      <header className={styles.heading}>
        <div>
          <h1>Admin overview</h1>
          <p>Current records and the areas available to your account.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1); }} disabled={loading}>
          <IconRefresh aria-hidden="true" size={16} stroke={1.8} />
          {loading ? "Loading counts" : "Refresh counts"}
        </button>
      </header>

      {failed && <p className={styles.errorNotice}>Some counts could not be loaded. Refresh to try again.</p>}

      <section aria-label="Current record counts" aria-busy={loading} className={styles.metrics}>
        {summaries.map(({ module, label, href, Icon }) => (
          <article className={styles.metric} key={module}>
            <div className={styles.metricHeading}><Icon aria-hidden="true" size={17} stroke={1.8} /><span>{label}</span></div>
            <strong>{loading ? "…" : counts?.[module] ?? "Unavailable"}</strong>
            <Link href={href}>Open {label.toLowerCase()} <IconArrowRight aria-hidden="true" size={14} /></Link>
          </article>
        ))}
        {!loading && summaries.length === 0 && <p className={styles.emptyMetrics}>Your available record areas are listed below.</p>}
      </section>

      <div className={styles.lowerPanels}>
        <section className={styles.panel} aria-labelledby="records-heading" aria-busy={loading}>
          <div className={styles.panelHeading}>
            <div><h2 id="records-heading">Records by area</h2><p>Current counts from the areas you can access.</p></div>
          </div>
          {loading && <p className={styles.panelState} role="status">Loading record counts…</p>}
          {!loading && !visible.length && <p className={styles.panelState}>No record areas are available for your account.</p>}
          {!loading && visible.length > 0 && !chartData.length && <p className={styles.panelState}>Record counts are unavailable. Refresh to try again.</p>}
          {!loading && chartData.length > 0 && !hasRecords && !failed && <p className={styles.panelState}>No records are available in these areas yet.</p>}
          {!loading && chartData.length > 0 && (hasRecords || failed) && <div className={styles.chartFrame} role="region" aria-label="Records chart" tabIndex={0}>
            <div className={styles.chart} aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} accessibilityLayer={false} margin={{ top: 8, right: 8, bottom: 2, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--admin-divider, var(--divider))" strokeDasharray="3 3" />
                  <XAxis dataKey="shortLabel" interval={0} tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 11 }} />
                  <YAxis allowDecimals={false} width={34} tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "color-mix(in srgb, var(--admin-accent, var(--accent)) 8%, transparent)" }} contentStyle={{ background: "var(--admin-surface, var(--surface))", borderColor: "var(--admin-divider, var(--divider))", borderRadius: 0, color: "var(--admin-foreground, var(--foreground))" }} formatter={(value) => [value, "Records"]} />
                  <Bar dataKey="count" name="Records" fill="var(--admin-accent, var(--accent))" radius={0} maxBarSize={38} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>}
          {!loading && visible.length > 0 && <table className={styles.visuallyHidden}>
            <caption>Current record counts by area</caption>
            <thead><tr><th scope="col">Area</th><th scope="col">Records</th></tr></thead>
            <tbody>{chartRows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.count ?? "Unavailable"}</td></tr>)}</tbody>
          </table>}
          {failed && <p className={styles.panelNote}>Unavailable areas are omitted from the chart and listed in the count table.</p>}
        </section>

        <section className={styles.panel} aria-labelledby="access-heading">
          <div className={styles.panelHeading}>
            <div><h2 id="access-heading">Workspace access</h2><p>Available areas follow your staff role.</p></div>
          </div>
          {links.length ? <ul className={styles.accessList}>
            {links.flatMap<{ label: string; href: string }>((group) => group.links).map((link) => <li key={link.href}><Link href={link.href}>{link.label}<IconArrowRight aria-hidden="true" size={14} /></Link></li>)}
          </ul> : <p className={styles.panelState}>No workspace areas are available for your account.</p>}
          <p className={styles.panelNote}>Activity history and trend data are not connected to this dashboard.</p>
        </section>
      </div>
    </div>
  );
}
