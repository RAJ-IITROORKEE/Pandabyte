"use client";

import type { ComponentProps } from "react";
import { parseChartSpec, type ChartSpec } from "./chart-spec";
import styles from "./workspace.module.css";

const W = 560, H = 240, L = 44, R = 12, T = 12, B = 36;
const fmt = (n: number) => Math.abs(n) >= 1000 ? n.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : String(Number(n.toFixed(2)));

function Chart({ spec }: { spec: ChartSpec }) {
  const all = spec.series.flatMap(s => s.values);
  const min = Math.min(0, ...all), max = Math.max(0, ...all) || 1;
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min || 1));
  const n = spec.x.length, step = (W - L - R) / n;
  const cx = (i: number) => L + step * (i + 0.5);
  const barW = Math.max(2, (step * 0.7) / spec.series.length);
  const every = Math.ceil(n / 10);
  const summary = `${spec.type === "bar" ? "Bar" : "Line"} chart${spec.title ? `: ${spec.title}` : ""}. ` + spec.series.map(s => `${s.name}: ${s.values.map((v, i) => `${spec.x[i]} ${fmt(v)}`).join(", ")}`).join(". ");
  return <figure className={styles.chart}>
    {spec.title && <figcaption>{spec.title}</figcaption>}
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      {[0, 0.5, 1].map(t => { const v = min + (max - min) * t; return <g key={t}><line className={styles.chartGrid} x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className={styles.chartTick} x={L - 6} y={y(v) + 4} textAnchor="end">{fmt(v)}</text></g>; })}
      {spec.series.map((s, k) => spec.type === "bar"
        ? s.values.map((v, i) => <rect key={`${k}-${i}`} className={styles[`chartS${k}`]} x={cx(i) - (barW * spec.series.length) / 2 + k * barW} y={Math.min(y(v), y(0))} width={barW} height={Math.abs(y(v) - y(0))} rx={2}><title>{`${s.name}, ${spec.x[i]}: ${fmt(v)}`}</title></rect>)
        : <g key={k} className={styles[`chartS${k}`]}><polyline fill="none" stroke="currentColor" strokeWidth={2} points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(" ")} />{s.values.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={3} fill="currentColor"><title>{`${s.name}, ${spec.x[i]}: ${fmt(v)}`}</title></circle>)}</g>)}
      {spec.x.map((label, i) => i % every === 0 && <text key={i} className={styles.chartTick} x={cx(i)} y={H - B + 16} textAnchor="middle">{label.length > 10 ? `${label.slice(0, 9)}…` : label}</text>)}
    </svg>
    {spec.series.length === 1 && <p className={styles.chartUnit}>{spec.series[0].name}</p>}{spec.series.length > 1 && <ul className={styles.chartLegend}>{spec.series.map((s, k) => <li key={k}><span className={styles[`chartS${k}`]} aria-hidden="true" />{s.name}</li>)}</ul>}
  </figure>;
}

// Used as a markdown SyntaxHighlighter for ```chart blocks; invalid specs fall back to a normal code block.
export function ChartBlock({ code, components }: { code: string; components: { Pre: React.ComponentType<ComponentProps<"pre">>; Code: React.ComponentType<ComponentProps<"code">> } }) {
  const spec = parseChartSpec(code);
  return spec ? <Chart spec={spec} /> : <details className={styles.chartFallback}><summary>Chart could not be drawn · show data</summary><components.Pre><components.Code>{code}</components.Code></components.Pre></details>;
}
