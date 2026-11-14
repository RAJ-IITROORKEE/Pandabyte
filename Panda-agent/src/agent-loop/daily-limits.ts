// Per-user daily limits (migration 20261114130000): pure parsers and the limit-reached message. No server imports.
export const LIMIT_NAMES = ['paid_messages', 'free_messages', 'web_searches', 'compiles'] as const;
export type LimitName = typeof LIMIT_NAMES[number];
export type LimitRow = { name: LimitName; perDay: number; version: number; updatedAt: string | null };
export type DailyUsage = { unlimited: boolean; limits: Record<LimitName, number>; used: Record<LimitName, number> };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const known = (v: unknown): v is LimitName => typeof v === 'string' && (LIMIT_NAMES as readonly string[]).includes(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 1000000000;
const perDayOk = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 10000;

/** PATCH body: exactly {name, perDay, expectedVersion}; perDay is 0..10000. */
export function parseLimitPatch(v: unknown): { name: LimitName; perDay: number; expectedVersion: number } | null {
 if (!record(v) || Object.keys(v).sort().join(',') !== 'expectedVersion,name,perDay') return null;
 if (!known(v.name) || !perDayOk(v.perDay)) return null;
 if (!Number.isSafeInteger(v.expectedVersion) || (v.expectedVersion as number) < 1 || (v.expectedVersion as number) > 1000000000) return null;
 return { name: v.name, perDay: v.perDay, expectedVersion: v.expectedVersion as number };
}

const parseRow = (row: unknown): LimitRow | null => {
 if (!record(row) || !known(row.name) || !perDayOk(row.perDay)) return null;
 if (!Number.isSafeInteger(row.version) || (row.version as number) < 1) return null;
 return { name: row.name, perDay: row.perDay, version: row.version as number, updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt.slice(0, 40) : null };
};
/** Admin RPC result: one valid row per name, in the fixed name order; null when anything is missing or malformed. */
export function parseLimitRows(raw: unknown): LimitRow[] | null {
 if (!Array.isArray(raw)) return null;
 const rows = raw.map(parseRow);
 const out = LIMIT_NAMES.map(n => rows.find(r => r?.name === n));
 return out.every(Boolean) ? out as LimitRow[] : null;
}

const counts = (v: unknown): Record<LimitName, number> | null => {
 if (!record(v)) return null;
 const out = {} as Record<LimitName, number>;
 for (const n of LIMIT_NAMES) { if (!count(v[n])) return null; out[n] = v[n]; }
 return out;
};
/** panda_agent_daily_usage() result; null when the shape is not exactly as expected. */
export function parseDailyUsage(raw: unknown): DailyUsage | null {
 if (!record(raw) || typeof raw.unlimited !== 'boolean') return null;
 const limits = counts(raw.limits), used = counts(raw.used);
 return limits && used ? { unlimited: raw.unlimited, limits, used } : null;
}

/** The assistant-styled reply shown when the daily quota refuses a turn. `limit` is the tier's per-day number when known. */
export function limitReachedText(tier: 'free' | 'paid', limit: number | null, contactUrl: string): string {
 const known = limit !== null && Number.isSafeInteger(limit) && limit >= 0;
 const head = known ? `today's limit of ${limit} messages` : "today's message limit";
 return tier === 'paid'
  ? `You've reached ${head} on paid models. You can continue tomorrow, switch to **Free models** now, or [contact us](${contactUrl}) to upgrade your limit.`
  : `You've reached ${head} on Free models. You can continue tomorrow, or [contact us](${contactUrl}) to upgrade your limit.`;
}
