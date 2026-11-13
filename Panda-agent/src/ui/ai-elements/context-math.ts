// Pure helpers for the context meter; adapted from the idea of Vercel AI Elements' Context (Apache-2.0).
export type MeterTone = "ok" | "warn" | "full";

/** Percent of the window used, clamped 0..100 with one decimal; null when the window is unknown. */
export function contextPercent(used: number, max: number | null | undefined): number | null {
  if (!max || !Number.isFinite(max) || max <= 0) return null;
  const raw = Math.min(100, Math.max(0, (Number.isFinite(used) ? used : 0) / max * 100));
  return Math.round(raw * 10) / 10;
}

/** SVG stroke dash values for a progress ring; offset hides the unused part. */
export function ringDash(percent: number, radius: number) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  return { circumference, offset: circumference * (1 - clamped / 100) };
}

/** Nano-dollars to a short USD string. */
export function formatUsd(nanoUsd: number): string {
  if (!Number.isFinite(nanoUsd) || nanoUsd <= 0) return "$0";
  const usd = nanoUsd / 1e9;
  return usd < 0.0001 ? "<$0.0001" : `$${usd.toFixed(4)}`;
}

export function meterTone(percent: number): MeterTone {
  return percent > 90 ? "full" : percent >= 70 ? "warn" : "ok";
}
