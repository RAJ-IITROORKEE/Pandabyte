import { createHash } from 'node:crypto';
import type { Admission, CaseSet, ControlRoomStore, Intake, Result } from './contracts.ts';
import { decodeCursor, isRecord, linkInput, metadata, publicUrl, reviewInput, uploadFile, uuid, validText } from './validation.ts';
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const response = (status: number, data: unknown, allow?: string) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(allow ? { Allow: allow } : {}) } });
const error = (status: number, code: string, allow?: string) => response(status, { error: { code } }, allow);
const statuses = ['upload_pending', 'pending_review', 'accepted_for_preparation', 'rejected', 'upload_failed', 'upload_outcome_unknown'];
function project(i: Intake) {
    if (!i || !uuid(i.reference) || !validText(i.title, 180) || !['link', 'upload'].includes(i.kind) || !statuses.includes(i.status) || !['unknown', 'permitted', 'denied'].includes(i.rightsStatus) || !Number.isSafeInteger(i.version) || i.version < 1 || !validText(i.createdAt, 50) || !validText(i.updatedAt, 50))
        throw Error('invalid projection');
    const uploadSummary = i.uploadSummary && { filename: i.uploadSummary.filename, mediaType: i.uploadSummary.mediaType, bytes: i.uploadSummary.bytes, integrityStatus: 'integrity_pending' };
    if (uploadSummary && (!validText(uploadSummary.filename, 180) || /[\\/]/.test(uploadSummary.filename) || !['application/pdf', 'text/plain', 'text/markdown'].includes(uploadSummary.mediaType) || !Number.isSafeInteger(uploadSummary.bytes) || uploadSummary.bytes < 1 || uploadSummary.bytes > 3145728))
        throw Error('invalid projection');
    const sourceSummary = i.sourceSummary && { sourceUrl: i.sourceSummary.sourceUrl, ...(i.sourceSummary.publisher ? { publisher: i.sourceSummary.publisher } : {}), fetched: false };
    if (sourceSummary && (!publicUrl(sourceSummary.sourceUrl) || (sourceSummary.publisher && !validText(sourceSummary.publisher, 120))))
        throw Error('invalid projection');
    const reviewSummary = i.reviewSummary && { decision: i.reviewSummary.decision, reason: i.reviewSummary.reason, reviewedAt: i.reviewSummary.reviewedAt };
    if (reviewSummary && (!['accept_for_preparation', 'reject'].includes(reviewSummary.decision) || !validText(reviewSummary.reason, 500) || !validText(reviewSummary.reviewedAt, 50)))
        throw Error('invalid projection');
    return { reference: i.reference, title: i.title, kind: i.kind, status: i.status, rightsStatus: i.rightsStatus, createdAt: i.createdAt, updatedAt: i.updatedAt, version: i.version, ...(uploadSummary ? { uploadSummary } : {}), ...(sourceSummary ? { sourceSummary } : {}), ...(reviewSummary ? { reviewSummary } : {}) };
}
function resultError<T>(r: Result<T>): Response | null {
    if (r.ok)
        return null;
    return error(r.code === 'forbidden' ? 403 : r.code === 'not_found' ? 404 : r.code === 'conflict' ? 409 : 503, r.code);
}
async function bodyBytes(req: Request, max: number): Promise<{
    bytes: Uint8Array;
} | {
    error: 413 | 400;
}> {
    if (!req.body)
        return { error: 400 };
    const reader = req.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.byteLength;
            if (size > max) {
                void reader.cancel().catch(() => { });
                return { error: 413 };
            }
            chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return { bytes };
    }
    catch {
        return { error: 400 };
    }
    finally {
        reader.releaseLock();
    }
}
async function json(req: Request, max = 8192): Promise<{
    value: unknown;
} | {
    error: 400 | 413 | 415;
}> {
    if (!/^application\/json(?:\s*;\s*[^;]+)*\s*$/i.test(req.headers.get('content-type') ?? ''))
        return { error: 415 };
    const body = await bodyBytes(req, max);
    if ('error' in body)
        return body;
    try {
        return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes)) };
    }
    catch {
        return { error: 400 };
    }
}
const inputError = (n: number) => error(n, n === 413 ? 'too_large' : n === 415 ? 'unsupported_media_type' : 'invalid_request');
const sameOrigin = (req: Request) => { try {
    return req.headers.get('origin') === new URL(req.url).origin;
}
catch {
    return false;
} };
const allowedQuery = (query: URLSearchParams, keys: string[]) => [...query.keys()].every(k => keys.includes(k) && query.getAll(k).length === 1);
export function createControlRoomHandlers(authenticate: () => Promise<Admission>, store: ControlRoomStore) {
    async function gate(req: Request, method: string, mutation = false): Promise<Response | null> {
        if (req.method !== method)
            return error(405, 'method_not_allowed', method);
        let admission: Admission;
        try {
            admission = await authenticate();
        }
        catch {
            return error(503, 'unavailable');
        }
        if (!admission || admission.kind !== 'admin')
            return error(admission?.kind === 'unauthorized' ? 401 : admission?.kind === 'forbidden' ? 403 : 503, admission?.kind === 'unauthorized' ? 'unauthorized' : admission?.kind === 'forbidden' ? 'forbidden' : 'unavailable');
        if (mutation && !sameOrigin(req))
            return error(403, 'forbidden');
        return null;
    }
    const run = async (op: () => Promise<Response>) => { try {
        return await op();
    }
    catch {
        return error(503, 'unavailable');
    } };
    return {
        overview: async (req: Request) => { const denied = await gate(req, 'GET'); if (denied)
            return denied; return run(async () => { const r = await store.overview(); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); const v = r.value; const counts = { sources: v.counts.sources, versions: v.counts.versions, chunks: v.counts.chunks }; const candidateSummary = { sealedInactive: v.candidateSummary.sealedInactive }; const intakeSummary = { total: v.intakeSummary.total }; if ([...Object.values(counts), candidateSummary.sealedInactive, intakeSummary.total].some(n => !Number.isSafeInteger(n) || n < 0))
            throw Error(); return response(200, { counts, candidateSummary, intakeSummary, availability: { metadata: v.availability.metadata === true, privateUpload: v.availability.privateUpload === true, retrieval: false, evaluation: false } }); }); },
        listIntakes: async (req: Request) => { const denied = await gate(req, 'GET'); if (denied)
            return denied; return run(async () => { const q = new URL(req.url).searchParams; if (!allowedQuery(q, ['status', 'limit', 'cursor']))
            return error(400, 'invalid_request'); const status = q.get('status') ?? undefined, cursor = q.get('cursor') ?? undefined; const rawLimit = q.get('limit') ?? '20'; if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50 || (status && !statuses.includes(status)) || (q.has('cursor') && (!cursor || !decodeCursor(cursor))))
            return error(400, 'invalid_request'); const r = await store.listIntakes({ limit: Number(rawLimit), ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) }); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); if (!Array.isArray(r.value.items) || r.value.items.length > 50 || (r.value.nextCursor && !decodeCursor(r.value.nextCursor)))
            throw Error(); return response(200, { items: r.value.items.map(project), nextCursor: r.value.nextCursor ?? null }); }); },
        getIntake: async (req: Request, reference: string) => { const denied = await gate(req, 'GET'); if (denied)
            return denied; if (!uuid(reference))
            return error(400, 'invalid_request'); return run(async () => { const r = await store.getIntake(reference); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); return response(200, project(r.value)); }); },
        link: async (req: Request) => { const denied = await gate(req, 'POST', true); if (denied)
            return denied; const key = req.headers.get('idempotency-key'); if (!uuid(key))
            return error(400, 'invalid_request'); const b = await json(req); if ('error' in b)
            return inputError(b.error); const input = linkInput(b.value); if (!input)
            return error(400, 'invalid_request'); return run(async () => { const r = await store.registerLink(input, key, hash(JSON.stringify(input))); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); return response(200, project(r.value)); }); },
        upload: async (req: Request) => { const denied = await gate(req, 'POST', true); if (denied)
            return denied; const key = req.headers.get('idempotency-key'); if (!uuid(key))
            return error(400, 'invalid_request'); const type = req.headers.get('content-type') ?? ''; if (!/^multipart\/form-data\s*;/i.test(type))
            return error(415, 'unsupported_media_type'); const b = await bodyBytes(req, 3145728 + 32768); if ('error' in b)
            return inputError(b.error); return run(async () => { let form: FormData; try {
            form = await new Request('https://localhost/', { method: 'POST', headers: { 'content-type': type }, body: b.bytes.slice().buffer as ArrayBuffer }).formData();
        }
        catch {
            return error(400, 'invalid_request');
        } const fields = [...form.entries()]; if (fields.some(([k]) => !['file', 'title', 'publisher', 'purpose', 'rightsEvidence'].includes(k)) || new Set(fields.map(([k]) => k)).size !== fields.length)
            return error(400, 'invalid_request'); const file = form.get('file'); if (!(file instanceof File) || fields.filter(([k]) => k === 'file').length !== 1)
            return error(400, 'invalid_request'); const values: Record<string, unknown> = {}; for (const [k, v] of fields)
            if (k !== 'file')
                values[k] = v; const m = metadata(values); if (!m)
            return error(400, 'invalid_request'); const bytes = new Uint8Array(await file.arrayBuffer()); const filename = file.name.normalize('NFC'); if (bytes.length > 3145728)
            return error(413, 'too_large'); if (!uploadFile(filename, file.type, bytes))
            return error(400, 'invalid_request'); const fileHash = hash(bytes); const input = { ...m, filename, mediaType: file.type, bytes, fileHash }; const inputHash = hash(JSON.stringify({ ...m, filename, mediaType: file.type, fileHash, bytes: bytes.length })); const r = await store.upload(input, key, inputHash); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); return response(200, project(r.value)); }); },
        review: async (req: Request, reference: string) => { const denied = await gate(req, 'PATCH', true); if (denied)
            return denied; if (!uuid(reference))
            return error(400, 'invalid_request'); const b = await json(req); if ('error' in b)
            return inputError(b.error); const input = reviewInput(b.value); if (!input)
            return error(400, 'invalid_request'); return run(async () => { const r = await store.review(reference, input); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); return response(200, project(r.value)); }); },
        caseSets: async (req: Request) => { const denied = await gate(req, 'GET'); if (denied)
            return denied; return run(async () => { const r = await store.caseSets(); const e = resultError(r); if (e)
            return e; if (!r.ok)
            throw Error(); if (!Array.isArray(r.value) || r.value.length > 100)
            throw Error(); return response(200, { items: r.value.map((c: CaseSet) => { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(c.key) || !/^[0-9a-f]{64}$/.test(c.hash) || !Number.isSafeInteger(c.count) || c.count < 0 || c.classification !== 'source_visible_engineering' || c.heldOut !== false)
                throw Error(); return { key: c.key, hash: c.hash, count: c.count, classification: c.classification, heldOut: false }; }) }); }); },
        evaluate: async (req: Request) => { const denied = await gate(req, 'POST', true); if (denied)
            return denied; const b = await json(req, 4096); if ('error' in b)
            return inputError(b.error); if (!isRecord(b.value) || Object.keys(b.value).some(k => !['caseSetKey', 'corpusFingerprint'].includes(k)) || !validText(b.value.caseSetKey, 100) || !/^[a-zA-Z0-9_-]+$/.test(b.value.caseSetKey) || typeof b.value.corpusFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(b.value.corpusFingerprint))
            return error(400, 'invalid_request'); return error(503, 'runtime_unavailable'); },
    };
}
