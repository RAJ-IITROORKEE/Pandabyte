import { createHash } from 'node:crypto';
import type { InsForgeClient } from '@insforge/sdk';
import type { ControlRoomStore, ErrorCode, Intake, Result } from './contracts.ts';
import { decodeCursor, uuid } from './validation.ts';
const prefix = 'panda_agent_control_room_';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const unavailable = <T>(): Result<T> => ({ ok: false, code: 'unavailable' });
const fail = <T>(code: ErrorCode): Result<T> => ({ ok: false, code });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function rpcError(error: unknown): ErrorCode {
    if (!object(error) || error.code !== 'P0001')
        return 'unavailable';
    if (error.details === 'not_found')
        return 'not_found';
    if (error.details === 'forbidden')
        return 'forbidden';
    if (error.details === 'version_conflict' || error.details === 'request_conflict' || error.details === 'invalid_state')
        return 'conflict';
    return 'unavailable';
}
function intake(raw: unknown): Intake {
    if (!object(raw) || typeof raw.reference !== 'string' || !uuid(raw.reference) || typeof raw.title !== 'string' || (raw.kind !== 'link' && raw.kind !== 'upload') || typeof raw.status !== 'string' || typeof raw.rightsStatus !== 'string' || typeof raw.createdAt !== 'string' || typeof raw.updatedAt !== 'string' || !Number.isSafeInteger(raw.version))
        throw Error('invalid intake');
    const i: Intake = { reference: raw.reference, title: raw.title, kind: raw.kind, status: raw.status, rightsStatus: raw.rightsStatus, createdAt: raw.createdAt, updatedAt: raw.updatedAt, version: raw.version as number };
    if (object(raw.sourceSummary)) {
        if (typeof raw.sourceSummary.url !== 'string' || raw.sourceSummary.fetched !== false)
            throw Error('invalid source');
        i.sourceSummary = { sourceUrl: raw.sourceSummary.url, fetched: false, ...(typeof raw.publisher === 'string' && raw.publisher ? { publisher: raw.publisher } : {}) };
    }
    if (object(raw.uploadSummary)) {
        const u = raw.uploadSummary;
        if (typeof u.filename !== 'string' || typeof u.mediaType !== 'string' || !Number.isSafeInteger(u.expectedSize))
            throw Error('invalid upload');
        i.uploadSummary = { filename: u.filename, mediaType: u.mediaType, bytes: u.expectedSize as number, integrityStatus: 'integrity_pending' };
    }
    if (object(raw.reviewSummary)) {
        const r = raw.reviewSummary;
        if (typeof r.decision !== 'string' || typeof r.reason !== 'string' || typeof r.reviewedAt !== 'string')
            throw Error('invalid review');
        i.reviewSummary = { decision: r.decision, reason: r.reason, reviewedAt: r.reviewedAt };
    }
    return i;
}
function cursorEncode(value: unknown): string | null {
    if (value === null || value === undefined)
        return null;
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
    if (!decodeCursor(encoded))
        throw Error('invalid cursor');
    return encoded;
}
export function createControlRoomStore(client: InsForgeClient, options: {
    privateUploadEnabled?: boolean;
} = {}): ControlRoomStore {
    const enabled = options.privateUploadEnabled === true;
    async function rpc(name: string, args: Record<string, unknown>): Promise<Result<unknown>> {
        try {
            const r = await client.database.schema('public').rpc(prefix + name, args);
            return r.error ? fail(rpcError(r.error)) : { ok: true, value: r.data };
        }
        catch {
            return unavailable();
        }
    }
    async function mapped<T>(name: string, args: Record<string, unknown>, project: (value: unknown) => T): Promise<Result<T>> {
        const r = await rpc(name, args);
        if (!r.ok)
            return r;
        try {
            return { ok: true, value: project(r.value) };
        }
        catch {
            return unavailable();
        }
    }
    const str = (s?: string) => s ?? '';
    return {
        overview: () => mapped('overview', {}, v => {
            if (!object(v) || !object(v.counts) || !object(v.candidateSummary) || !object(v.intakeSummary))
                throw Error();
            const number = (x: unknown) => { if (!Number.isSafeInteger(x) || (x as number) < 0)
                throw Error(); return x as number; };
            const total = Object.values(v.intakeSummary).reduce<number>((sum, n) => sum + number(n), 0);
            if (!Number.isSafeInteger(total))
                throw Error();
            return { counts: { sources: number(v.counts.sources), versions: number(v.counts.versions), chunks: number(v.counts.chunks) }, candidateSummary: { sealedInactive: number(v.candidateSummary.sealedInactive) }, intakeSummary: { total }, availability: { metadata: true, privateUpload: enabled, retrieval: false as const, evaluation: false as const } };
        }),
        listIntakes: async (query) => {
            const c = query.cursor ? decodeCursor(query.cursor) : { before: null, beforeId: null };
            if (!c)
                return unavailable();
            return mapped('list_intakes', { p_limit: query.limit, p_before: c.before, p_before_id: c.beforeId, p_status: query.status ?? null }, v => { if (!object(v) || !Array.isArray(v.items) || v.items.length > 50)
                throw Error(); return { items: v.items.map(intake), nextCursor: cursorEncode(v.nextCursor) }; });
        },
        getIntake: reference => mapped('get_intake', { p_reference: reference }, intake),
        registerLink: (input, key) => mapped('register_link', { p_key: key, p_title: input.title, p_url: input.sourceUrl, p_publisher: str(input.publisher), p_purpose: str(input.purpose), p_rights_statement: str(input.rightsEvidence) }, intake),
        upload: async (input, key) => {
            if (!enabled || input.bytes.byteLength < 1 || input.bytes.byteLength > 3145728 || sha(input.bytes) !== input.fileHash)
                return unavailable();
            const normalizedType = input.filename.toLowerCase().endsWith('.md') && input.mediaType === 'text/plain' ? 'text/markdown' : input.mediaType;
            const reserved = await rpc('reserve_upload', { p_key: key, p_title: input.title, p_filename: input.filename, p_media_type: normalizedType, p_expected_size: input.bytes.byteLength, p_expected_sha256: input.fileHash, p_publisher: str(input.publisher), p_purpose: str(input.purpose), p_rights_statement: str(input.rightsEvidence) });
            if (!reserved.ok)
                return reserved;
            let item: Intake, created: boolean;
            try {
                if (!object(reserved.value) || typeof reserved.value.created !== 'boolean')
                    throw Error();
                item = intake(reserved.value.intake);
                created = reserved.value.created;
            }
            catch {
                return unavailable();
            }
            if (!created)
                return { ok: true, value: item };
            if (item.kind !== 'upload' || item.status !== 'upload_pending' || item.version !== 1)
                return unavailable();
            const ext = normalizedType === 'application/pdf' ? 'pdf' : normalizedType === 'text/markdown' ? 'md' : normalizedType === 'text/plain' ? 'txt' : null;
            if (!ext)
                return unavailable();
            const path = `intakes/${item.reference}/source.${ext}`;
            let outcome = 'upload_outcome_unknown';
            try {
                const bucket = client.storage.from('panda-agent-intake-private');
                const up = await bucket.upload(path, new Blob([input.bytes.slice().buffer as ArrayBuffer], { type: normalizedType }));
                if (!up.error && up.data && up.data.key === path) {
                    const read = await bucket.download(path);
                    if (!read.error && read.data instanceof Blob && read.data.size === input.bytes.byteLength && read.data.size <= 3145728) {
                        const actual = new Uint8Array(await read.data.arrayBuffer());
                        if (sha(actual) === input.fileHash)
                            outcome = 'pending_review';
                    }
                }
            }
            catch { /* Keep the uncertain result for reconciliation. */ }
            return mapped('record_upload_outcome', { p_reference: item.reference, p_expected_version: item.version, p_outcome: outcome, p_reason: outcome === 'pending_review' ? 'Private write and readback reported; integrity remains pending' : 'Private write or readback outcome requires reconciliation' }, intake);
        },
        review: (reference, input) => mapped('review', { p_reference: reference, p_expected_version: input.expectedVersion, p_decision: input.decision, p_rights: input.rights, p_rights_evidence: input.rightsEvidence, p_reason: input.reason }, intake),
        caseSets: async () => ({ ok: true, value: [{ key: 'engineering-listings-v1', hash: '9f33d626e2f82390291c1601808ef11c000f517f98d1339a142141114df4fd43', count: 20, classification: 'source_visible_engineering', heldOut: false }] }),
    };
}
