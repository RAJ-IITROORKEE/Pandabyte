// OpenRouter key spend for the Admin Models page (GET https://openrouter.ai/api/v1/key). The key is never logged or returned.
/** US dollars; limit and remaining are null when the key has no spend limit. */
export type OpenRouterKeyUsage = { usage: number | null; limit: number | null; remaining: number | null; daily: number | null; weekly: number | null; low: boolean };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Low: under $5 or under a fifth of the key limit. At zero, every paid model and the free-pool fallback stop. */
export const lowBalance = (limit: number | null, remaining: number | null) => limit !== null && remaining !== null && (remaining < 5 || remaining < limit / 5);

export async function fetchOpenRouterKey(apiKey: string, fetcher: typeof fetch = fetch): Promise<OpenRouterKeyUsage> {
 const response = await fetcher('https://openrouter.ai/api/v1/key', { method: 'GET', headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
 if (response.status !== 200) throw new Error(`OpenRouter key returned ${response.status}`);
 const body = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
 const d = body?.data && typeof body.data === 'object' ? body.data : {};
 const limit = num(d.limit), remaining = num(d.limit_remaining);
 return { usage: num(d.usage), limit, remaining, daily: num(d.usage_daily), weekly: num(d.usage_weekly), low: lowBalance(limit, remaining) };
}

// shortcut: one cached value per server instance (one OpenRouter key per deployment), 60 s; key the cache if several keys are ever used.
let cached: { at: number; value: OpenRouterKeyUsage } | null = null;
export async function cachedOpenRouterKey(apiKey: string): Promise<OpenRouterKeyUsage> {
 if (cached && Date.now() - cached.at < 60000) return cached.value;
 const value = await fetchOpenRouterKey(apiKey);
 cached = { at: Date.now(), value };
 return value;
}
