export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function panelSummary(input: { busy: boolean; complete: boolean; elapsedMs: number }): string {
  const t = formatElapsed(input.elapsedMs);
  if (input.busy) return `Working · ${t}`;
  return input.complete ? `Worked for ${t}` : `Stopped after ${t}`;
}
