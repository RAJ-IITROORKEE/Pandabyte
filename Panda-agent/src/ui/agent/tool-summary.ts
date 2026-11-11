export type ToolCall = {
  id: string;
  name: string;
  label: string;
  state: "running" | "complete" | "failed" | "unknown";
  durationMs?: number;
};

/** "Using tools · 1.2s" while live, otherwise "Used 3 tools · 2.4s". Duration sums only the known values. */
export function toolGroupSummary(calls: ToolCall[], live: boolean): string {
  if (calls.length === 0) return "";
  const known = calls.filter((c) => c.durationMs != null);
  const time = known.length ? ` · ${(known.reduce((t, c) => t + (c.durationMs ?? 0), 0) / 1000).toFixed(1)}s` : "";
  if (live && calls.some((c) => c.state === "running")) return `Using tools${time}`;
  return `Used ${calls.length} ${calls.length === 1 ? "tool" : "tools"}${time}`;
}
