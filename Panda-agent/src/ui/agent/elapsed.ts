export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function panelSummary(input: { busy: boolean; complete: boolean; elapsedMs: number }): string {
  const t = formatElapsed(input.elapsedMs);
  if (input.busy) return `Thinking · ${t}`;
  return input.complete ? `Worked for ${t}` : `Stopped after ${t}`;
}

/** Per-step durations in ms; null when a time is missing. A step ends when the next arrives; the last uses `finishedAt`. */
export function stepDurations(times: number[] | undefined, finishedAt: number | null): (number | null)[] {
  if (!times) return [];
  return times.map((t, i) => {
    const next = i + 1 < times.length ? times[i + 1] : finishedAt;
    return next === null || !Number.isFinite(t) || !Number.isFinite(next) || next < t ? null : next - t;
  });
}
