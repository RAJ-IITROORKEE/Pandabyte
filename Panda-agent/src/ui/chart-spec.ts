// Strict, model-output chart schema. Anything that does not match exactly is shown as plain code.
export type ChartSpec = { type: 'bar' | 'line'; title?: string; x: string[]; series: { name: string; values: number[] }[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function parseChartSpec(source: string): ChartSpec | null {
  if (source.length > 8000) return null;
  let raw: unknown;
  try { raw = JSON.parse(source); } catch { return null; }
  if (!isRecord(raw) || !onlyKeys(raw, ['type', 'title', 'x', 'series'])) return null;
  if (raw.type !== 'bar' && raw.type !== 'line') return null;
  if (raw.title !== undefined && !(typeof raw.title === 'string' && raw.title.length <= 80)) return null;
  const { x, series } = raw;
  if (!Array.isArray(x) || x.length < 1 || x.length > 50 || !x.every(label => text(label, 40))) return null;
  if (!Array.isArray(series) || series.length < 1 || series.length > 4) return null;
  for (const item of series) {
    if (!isRecord(item) || !onlyKeys(item, ['name', 'values']) || !text(item.name, 40)) return null;
    if (!Array.isArray(item.values) || item.values.length !== x.length || !item.values.every(n => typeof n === 'number' && Number.isFinite(n))) return null;
  }
  return { type: raw.type, ...(raw.title !== undefined ? { title: raw.title as string } : {}), x: x as string[], series: series as ChartSpec['series'] };
}
