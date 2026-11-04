export type ModelCatalogItem = { id: string; name: string; context: number; promptPerToken: string; completionPerToken: string };
type Admission = { allowed: true } | { allowed: false; status: 401 | 403 | 503 };
const URL = 'https://openrouter.ai/api/v1/models';
const MAX_BYTES = 8 * 1024 * 1024;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const price = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) && Number(value) <= 1;

export function projectModelCatalog(value: unknown): ModelCatalogItem[] {
    const data = (value as { data?: unknown })?.data;
    if (!Array.isArray(data) || data.length === 0 || data.length > 5000) throw Error('Invalid catalog');
    const result: ModelCatalogItem[] = [];
    const seen = new Set<string>();
    for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const { id, name, context_length: context, pricing } = item;
        if (typeof id !== 'string' || id.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(id) || seen.has(id) || typeof name !== 'string' || !name.trim() || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name) || !Number.isSafeInteger(context) || context < 1 || context > 100_000_000 || !pricing || !price(pricing.prompt) || !price(pricing.completion)) continue;
        seen.add(id); result.push({ id, name, context, promptPerToken: pricing.prompt, completionPerToken: pricing.completion });
    }
    if (!result.length) throw Error('Invalid catalog');
    return result.sort((a,b) => a.name.localeCompare(b.name));
}

async function readCatalog(fetcher: typeof fetch): Promise<ModelCatalogItem[]> {
    const response = await fetcher(URL, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok || !response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw Error('Catalog unavailable');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
    try {
        for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BYTES) throw Error('Catalog too large'); parts.push(part.value); }
    } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return projectModelCatalog(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

// Only projected public catalog data is cached; each caller is authorized afresh.
export function createModelCatalogHandler(authorize: () => Promise<Admission>, fetcher: typeof fetch = fetch, now: () => number = Date.now) {
    let cached: { items: ModelCatalogItem[]; expires: number } | undefined;
    let pending: Promise<ModelCatalogItem[]> | undefined;
    const admit = async (): Promise<Admission> => { try { return await authorize(); } catch { return { allowed:false, status:503 }; } };
    return async (): Promise<Response> => {
        const initial = await admit();
        if (!initial.allowed) return Response.json({ error:{ code:'access_unavailable' } }, { status: initial.status, headers });
        try {
            if (!cached || now() >= cached.expires) {
                pending ??= readCatalog(fetcher);
                try { const items = await pending; cached = { items, expires: now() + 300000 }; } finally { pending = undefined; }
            }
            const final = await admit();
            if (!final.allowed) return Response.json({ error:{ code:'access_unavailable' } }, { status: final.status, headers });
            return Response.json({ models:cached.items }, { headers });
        } catch { return Response.json({ error:{ code:'catalog_unavailable' } }, { status:503, headers }); }
    };
}
