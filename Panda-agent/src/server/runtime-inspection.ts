import { getRuntimeProductEvidence, listRuntimeProducts } from '../retrieval/insforge-adapters.ts';

type Client = Parameters<typeof listRuntimeProducts>[0];
type Auth = { kind: 'signed_in' | 'admin'; client: Client } | { kind: 'unauthorized' | 'forbidden' | 'unavailable' };
type RuntimeStatus = { available: boolean; mode: 'aws_opencode_local'; retrievalMethod: 'lexical' };
type Dependencies = { authenticate: () => Promise<Auth>; runtimeStatus: () => Promise<RuntimeStatus> };
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
function response(status: number, value: unknown): Response {
    return new Response(JSON.stringify(value), { status, headers: { ...headers, ...(status === 405 ? { Allow: 'GET' } : {}) } });
}
const fail = (status: number) => response(status, { error: ({ 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 503: 'unavailable' } as Record<number, string>)[status] });
function query(request: Request, allowed: 'none' | 'sku'): { valid: boolean; sku?: string } {
    try {
        const params = new URL(request.url).searchParams;
        const keys = [...params.keys()];
        if (allowed === 'none') return { valid: keys.length === 0 };
        if (keys.some(k => k !== 'sku') || params.getAll('sku').length > 1) return { valid: false };
        const sku = params.get('sku');
        if (sku === null) return { valid: true };
        if (!sku.trim() || sku.length > 128 || sku !== sku.trim()) return { valid: false };
        return { valid: true, sku };
    } catch { return { valid: false }; }
}
export function createRuntimeInspectionHandlers({ authenticate, runtimeStatus }: Dependencies) {
    async function authorize(request: Request, admin: boolean): Promise<{ kind: 'signed_in' | 'admin'; client: Client } | Response> {
        if (request.method !== 'GET') return fail(405);
        let auth: Auth;
        try { auth = await authenticate(); } catch { return fail(503); }
        if (!auth || typeof auth !== 'object') return fail(503);
        if (auth.kind === 'unauthorized') return fail(401);
        if (auth.kind === 'forbidden') return fail(403);
        if (auth.kind === 'unavailable') return fail(503);
        if (admin && auth.kind !== 'admin') return fail(403);
        if ((auth.kind === 'admin' || auth.kind === 'signed_in') && 'client' in auth && auth.client) return auth;
        return fail(503);
    }
    return {
        async productsGET(request: Request): Promise<Response> {
            const auth = await authorize(request, false);
            if (auth instanceof Response) return auth;
            if (!query(request, 'none').valid) return fail(400);
            try {
                const products = await listRuntimeProducts(auth.client);
                const status = await runtimeStatus();
                if (typeof status?.available !== 'boolean' || status.mode !== 'aws_opencode_local' || status.retrievalMethod !== 'lexical') return fail(503);
                return response(200, { products, runtime: { available: status.available, mode: 'aws_opencode_local', retrievalMethod: 'lexical' }, corpus: { classification: 'captured_listing_engineering', candidateState: 'sealed_inactive', denseAvailable: false } });
            } catch { return fail(503); }
        },
        async corpusGET(request: Request): Promise<Response> {
            const auth = await authorize(request, true);
            if (auth instanceof Response) return auth;
            const params = query(request, 'sku');
            if (!params.valid) return fail(400);
            try {
                const products = await listRuntimeProducts(auth.client);
                if (params.sku && !products.some(p => p.sku.toLowerCase() === params.sku!.toLowerCase())) return fail(404);
                const selected = params.sku ? await getRuntimeProductEvidence(auth.client, params.sku) : null;
                if (params.sku && !selected) return fail(503);
                const status = await runtimeStatus();
                if (typeof status?.available !== 'boolean' || status.mode !== 'aws_opencode_local' || status.retrievalMethod !== 'lexical') return fail(503);
                return response(200, { products, selected, runtime: { available: status.available, mode: 'aws_opencode_local', retrievalMethod: 'lexical' }, corpus: { classification: 'captured_listing_engineering', candidateState: 'sealed_inactive', denseAvailable: false }, capabilities: { externalFetch: false, indexUploads: false, compile: false } });
            } catch { return fail(503); }
        },
    };
}
