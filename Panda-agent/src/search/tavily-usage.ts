// Tavily credit usage for the Admin Tools tab (GET https://api.tavily.com/usage). The key is never logged or returned.
export type TavilyUsage = { keyUsage: number | null; keyLimit: number | null; searchUsage: number | null; plan: string | null; planUsage: number | null; planLimit: number | null };
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const rec = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

export async function fetchTavilyUsage(apiKey: string, options: { fetcher?: typeof fetch; signal?: AbortSignal } = {}): Promise<TavilyUsage> {
 const timeout = AbortSignal.timeout(5000);
 const response = await (options.fetcher ?? fetch)('https://api.tavily.com/usage', {
  method: 'GET', headers: { authorization: `Bearer ${apiKey}` }, redirect: 'error', cache: 'no-store',
  signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
 });
 if (response.status !== 200) throw new Error(`Tavily usage returned ${response.status}`);
 const body = rec(await response.json().catch(() => null)), key = rec(body.key), account = rec(body.account);
 return { keyUsage: num(key.usage), keyLimit: num(key.limit), searchUsage: num(key.search_usage), plan: typeof account.current_plan === 'string' ? account.current_plan.slice(0, 60) : null, planUsage: num(account.plan_usage), planLimit: num(account.plan_limit) };
}

// shortcut: one cached value per server instance (one Tavily key per deployment), 60 s; key the cache if several keys are ever used.
let cached: { at: number; value: TavilyUsage } | null = null;
export async function cachedTavilyUsage(apiKey: string): Promise<TavilyUsage> {
 if (cached && Date.now() - cached.at < 60000) return cached.value;
 const value = await fetchTavilyUsage(apiKey);
 cached = { at: Date.now(), value };
 return value;
}
