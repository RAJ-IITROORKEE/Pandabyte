import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { IconAlertTriangle, IconCategory, IconPackages, IconTags } from "@tabler/icons-react";
import type { ProductTableStats } from "@/lib/admin/product-contract";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./chart";
import styles from "./product-stats.module.css";

const countFormat = new Intl.NumberFormat("en-IN");
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const moneyAxisFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const categoryChartConfig = { count: { label: "Products", color: "var(--admin-chart-1, var(--chart-1))" } } satisfies ChartConfig;
const priceChartConfig = { value: { label: "Current price", color: "var(--admin-chart-1, var(--chart-1))" } } satisfies ChartConfig;

function count(value: number) {
  return countFormat.format(value);
}

function price(value: number) {
  return moneyFormat.format(value / 100);
}

function categoryAxisLabel(value: string) {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}

export function ProductStats({ stats, loading }: { stats: ProductTableStats | undefined; loading: boolean }) {
  if (!stats) return <section aria-busy={loading} aria-label="Product statistics" className={styles.stats}>
    <p className={styles.state} role="status">{loading ? "Loading product statistics…" : "Product statistics are unavailable."}</p>
  </section>;

  const prices = stats.prices;
  const categoryChartHeight = Math.max(180, stats.categories.length * 32 + 44);
  const largestCategory = Math.max(1, ...stats.categories.map((category) => category.count));
  const priceData = prices ? [
    { label: "Lowest", value: prices.minPaise },
    { label: "Average", value: prices.avgPaise },
    { label: "Highest", value: prices.maxPaise },
  ] : [];

  return <section aria-busy={loading} aria-label="Product statistics" className={styles.stats}>
    <div className={styles.kpis}>
      <article className={styles.kpi}>
        <header className={styles.kpiHeading}><IconPackages aria-hidden="true" size={16} stroke={1.7} /><h2>Total products</h2></header>
        <strong className={styles.kpiValue}>{count(stats.totalProducts)}</strong>
        <p className={styles.kpiCaption}>Non-archived catalog</p>
      </article>
      <article className={styles.kpi}>
        <header className={styles.kpiHeading}><IconCategory aria-hidden="true" size={16} stroke={1.7} /><h2>Categories</h2></header>
        <strong className={styles.kpiValue}>{count(stats.categories.length)}</strong>
        <p className={styles.kpiCaption}>Product groups</p>
      </article>
      <article className={styles.kpi}>
        <header className={styles.kpiHeading}><IconTags aria-hidden="true" size={16} stroke={1.7} /><h2>Priced products</h2></header>
        <strong className={styles.kpiValue}>{prices ? count(prices.pricedProducts) : "0"}</strong>
        <p className={styles.kpiCaption}>{prices ? "With a current price" : "No configured prices"}</p>
      </article>
      <article className={styles.kpi}>
        <header className={styles.kpiHeading}><IconAlertTriangle aria-hidden="true" size={16} stroke={1.7} /><h2>Unpriced products</h2></header>
        <strong className={styles.kpiValue}>{count(stats.unpricedProducts)}</strong>
        <p className={styles.kpiCaption}>Need pricing</p>
      </article>
    </div>

    <div className={styles.charts}>
      <article className={styles.panel}>
        <header className={styles.panelHeading}>
          <div><h2>Products by category</h2><p>Products can appear in more than one category.</p></div>
          <span className={styles.panelCount}>{count(stats.categories.length)} categories</span>
        </header>
        {stats.categories.length ? <>
          <div className={styles.chartViewport} role="region" aria-label="Visual category chart; exact values are in the following table." tabIndex={categoryChartHeight > 278 ? 0 : undefined}>
            <ChartContainer aria-hidden="true" className={`${styles.chart} ${styles.categoryChart}`} config={categoryChartConfig} style={{ height: categoryChartHeight }}>
              <BarChart data={stats.categories} layout="vertical" accessibilityLayer={false} margin={{ top: 6, right: 36, bottom: 2, left: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--admin-divider, var(--divider))" strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, largestCategory]} allowDecimals={false} tickFormatter={(value) => count(Number(value))} tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 10 }} />
                <YAxis type="category" dataKey="title" width={88} interval={0} tickFormatter={(value) => categoryAxisLabel(String(value))} tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 10 }} />
                <ChartTooltip cursor={{ fill: "color-mix(in srgb, var(--admin-accent, var(--accent)) 8%, transparent)" }} content={<ChartTooltipContent valueFormatter={(value) => count(value)} />} />
                <Bar dataKey="count" name="Products" fill="var(--color-count)" radius={2} maxBarSize={16} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" offset={7} fill="var(--admin-foreground, var(--foreground))" fontSize={10} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
          <div className={styles.visuallyHidden}><table>
            <caption>Current product count by category</caption>
            <thead><tr><th scope="col">Category</th><th scope="col">Products</th></tr></thead>
            <tbody>{stats.categories.map((category) => <tr key={category.id}><th scope="row">{category.title}</th><td>{count(category.count)}</td></tr>)}</tbody>
          </table></div>
        </> : <p className={styles.state}>No categories yet.</p>}
      </article>

      <article className={styles.panel}>
        <header className={styles.panelHeading}>
          <div><h2>Current price comparison</h2><p>Lowest, average and highest current product prices.</p></div>
        </header>
        {prices ? <>
          <ChartContainer aria-hidden="true" className={`${styles.chart} ${styles.priceChart}`} config={priceChartConfig}>
            <BarChart data={priceData} accessibilityLayer={false} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--admin-divider, var(--divider))" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 10 }} />
              <YAxis width={62} domain={[0, Math.max(1, prices.maxPaise)]} tickFormatter={(value) => moneyAxisFormat.format(Number(value) / 100)} tickLine={false} axisLine={false} tick={{ fill: "var(--admin-muted, var(--muted))", fontSize: 9 }} />
              <ChartTooltip cursor={{ fill: "color-mix(in srgb, var(--admin-accent, var(--accent)) 8%, transparent)" }} content={<ChartTooltipContent valueFormatter={price} />} />
              <Bar dataKey="value" name="Current price" fill="var(--color-value)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          <dl className={styles.priceValues}>
            <div><dt>Lowest</dt><dd>{price(prices.minPaise)}</dd></div>
            <div><dt>Average</dt><dd>{price(prices.avgPaise)}</dd></div>
            <div><dt>Highest</dt><dd>{price(prices.maxPaise)}</dd></div>
          </dl>
          <p className={styles.note}>{count(prices.pricedProducts)} current prices; unpriced products excluded. This is not price history.</p>
        </> : <p className={styles.state}>No configured product prices.</p>}
      </article>
    </div>
  </section>;
}
