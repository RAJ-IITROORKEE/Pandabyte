import type { LinkInput, Metadata, ReviewInput } from './contracts.ts';
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
export const uuid = (s: string | null): s is string => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function metadata(v: Record<string, unknown>): Metadata | null {
    if (!text(v.title, 180) || (v.publisher !== undefined && !text(v.publisher, 120)) || (v.purpose !== undefined && !text(v.purpose, 500)) || (v.rightsEvidence !== undefined && !text(v.rightsEvidence, 1000)))
        return null;
    return { title: v.title.trim(), ...(typeof v.publisher === 'string' ? { publisher: v.publisher.trim() } : {}), ...(typeof v.purpose === 'string' ? { purpose: v.purpose.trim() } : {}), ...(typeof v.rightsEvidence === 'string' ? { rightsEvidence: v.rightsEvidence.trim() } : {}) };
}
export function publicUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 2048 || /[\s\x00-\x1f\x7f\\]/.test(value) || !/^https:\/\/[A-Za-z0-9.-]+(?::443)?(?:\/[^?#]*)?$/.test(value))
        return false;
    const authority = value.slice(8).split('/')[0];
    const host = authority.replace(/:443$/, '').toLowerCase();
    if (host.length > 253 || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$/.test(host) || /(?:^|\.)(?:localhost|local|localdomain|internal|invalid|test|onion|lan|home)$/.test(host))
        return false;
    return host.split('.').every(label => label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}
export function linkInput(v: unknown): LinkInput | null {
    if (!object(v) || !keys(v, ['kind', 'title', 'sourceUrl', 'publisher', 'purpose', 'rightsEvidence']) || v.kind !== 'link' || !publicUrl(v.sourceUrl))
        return null;
    const m = metadata(v);
    return m ? { ...m, kind: 'link', sourceUrl: v.sourceUrl } : null;
}
export function reviewInput(v: unknown): ReviewInput | null {
    if (!object(v) || !keys(v, ['decision', 'expectedVersion', 'reason', 'rights', 'rightsEvidence']) || !['accept_for_preparation', 'reject'].includes(v.decision as string) || !Number.isSafeInteger(v.expectedVersion) || (v.expectedVersion as number) < 1 || !text(v.reason, 500) || !['unknown', 'permitted', 'denied'].includes(v.rights as string) || !text(v.rightsEvidence, 1000))
        return null;
    if (v.decision === 'accept_for_preparation' && v.rights !== 'permitted')
        return null;
    return { decision: v.decision as ReviewInput['decision'], expectedVersion: v.expectedVersion as number, reason: (v.reason as string).trim(), rights: v.rights as ReviewInput['rights'], rightsEvidence: (v.rightsEvidence as string).trim() };
}
export function uploadFile(filename: string, mediaType: string, bytes: Uint8Array): boolean {
    if (!text(filename, 180) || /[\\/]/.test(filename) || filename === '.' || filename === '..' || filename !== filename.normalize('NFC') || !bytes.length || bytes.length > 3145728)
        return false;
    const extension = filename.toLowerCase().split('.').pop();
    if (extension === 'pdf')
        return mediaType === 'application/pdf' && bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
    if (!((extension === 'txt' && mediaType === 'text/plain') || (extension === 'md' && ['text/markdown', 'text/plain'].includes(mediaType))))
        return false;
    if (bytes.includes(0))
        return false;
    try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(decoded);
    }
    catch {
        return false;
    }
}
export const isRecord = object;
export const validText = text;
// Opaque cursor encodes only the stable database timestamp and UUID seek tuple.
export function decodeCursor(value: string): {
    before: string;
    beforeId: string;
} | null {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(value))
        return null;
    try {
        const bytes = Buffer.from(value, 'base64url');
        if (bytes.toString('base64url') !== value)
            return null;
        const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!object(parsed) || Object.keys(parsed).sort().join(',') !== 'before,beforeId' || typeof parsed.before !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(parsed.before) || !Number.isFinite(Date.parse(parsed.before)) || !uuid(typeof parsed.beforeId === 'string' ? parsed.beforeId : null))
            return null;
        const [year, month, day] = parsed.before.slice(0, 10).split('-').map(Number);
        const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
        const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1])
            return null;
        return { before: parsed.before, beforeId: parsed.beforeId as string };
    }
    catch {
        return null;
    }
}
