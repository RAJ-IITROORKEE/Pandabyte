import { NativeInspectionError, projectNativeInspection } from './inspection-client.ts';

export type InspectionAdmission = { allowed: true; subject: string; sessionId: string } | { allowed: false; status: 401 | 403 | 503 };
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...(status === 405 ? { Allow: 'GET' } : {}) } });
const fail = (status: number, code: string) => json(status, { error: { code } });

export function createRuntimeInspectionHandler(admit: () => Promise<InspectionAdmission>, inspect: (signal?: AbortSignal) => Promise<unknown>) {
    async function authenticate(): Promise<{ subject: string; sessionId: string } | Response> {
        try {
            const admission = await admit();
            if (admission?.allowed === true && admission.subject && admission.sessionId) return { subject: admission.subject, sessionId: admission.sessionId };
            if (admission?.allowed === false && [401, 403].includes(admission.status)) return fail(admission.status, admission.status === 401 ? 'unauthorized' : 'forbidden');
        } catch { /* Admission failures release no runtime data. */ }
        return fail(503, 'unavailable');
    }
    return async (request: Request): Promise<Response> => {
        if (request.method !== 'GET') return fail(405, 'method_not_allowed');
        const first = await authenticate();
        if (first instanceof Response) return first;
        let response: Response;
        try {
            if (new URL(request.url).search !== '' || request.body !== null || request.headers.has('transfer-encoding') || (request.headers.has('content-length') && request.headers.get('content-length') !== '0')) return fail(400, 'invalid_request');
            if (request.signal.aborted) return fail(503, 'unavailable');
            const value = projectNativeInspection(await inspect(request.signal));
            response = json(200, value);
        } catch (error) {
            response = fail(503, error instanceof NativeInspectionError && error.code === 'version_mismatch' ? 'version_mismatch' : 'unavailable');
        }
        const final = await authenticate();
        if (final instanceof Response) return final;
        if (first.subject !== final.subject || first.sessionId !== final.sessionId) return fail(403, 'forbidden');
        if (request.signal.aborted) return fail(503, 'unavailable');
        return response;
    };
}
