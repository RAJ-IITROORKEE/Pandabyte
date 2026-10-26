"use client";

import * as React from "react";
import { ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import styles from "./chart.module.css";

export type ChartConfig = Record<string, { label: React.ReactNode; color: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("ChartTooltipContent must be used inside ChartContainer.");
  return context;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof ResponsiveContainer>["children"];
};

export function ChartContainer({ config, className, children, style, ...props }: ChartContainerProps) {
  const chartId = `admin-chart-${React.useId().replace(/:/g, "")}`;
  const variables = Object.fromEntries(Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])) as React.CSSProperties;

  return <ChartContext.Provider value={{ config }}>
    <div {...props} className={`${styles.container} ${className ?? ""}`} data-chart={chartId} style={{ ...style, ...variables }}>
      <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>{children}</ResponsiveContainer>
    </div>
  </ChartContext.Provider>;
}

export function ChartTooltipContent({ active, payload, label, className, valueFormatter }: {
  active?: boolean;
  payload?: TooltipContentProps["payload"];
  label?: TooltipContentProps["label"];
  className?: string;
  valueFormatter?: (value: number) => React.ReactNode;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  return <div className={`${styles.tooltip} ${className ?? ""}`}>
    {label != null && <p className={styles.tooltipLabel}>{String(label)}</p>}
    <div className={styles.tooltipRows}>
      {payload.filter((item) => item.type !== "none").map((item, index) => {
        const key = String(item.dataKey ?? item.name ?? "value");
        const itemConfig = config[key];
        const color = item.color ?? item.fill ?? "var(--admin-chart-1, var(--chart-1))";
        const displayedValue = typeof item.value === "number" ? valueFormatter?.(item.value) ?? countFormat(item.value) : item.value == null ? "" : String(item.value);
        return <div className={styles.tooltipRow} key={`${key}-${index}`}>
          <span aria-hidden="true" className={styles.tooltipIndicator} style={{ backgroundColor: color }} />
          <span className={styles.tooltipName}>{itemConfig?.label ?? item.name ?? key}</span>
          <strong className={styles.tooltipValue}>{displayedValue}</strong>
        </div>;
      })}
    </div>
  </div>;
}

function countFormat(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export { Tooltip as ChartTooltip };
