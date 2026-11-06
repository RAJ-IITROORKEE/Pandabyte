import { randomBytes } from 'node:crypto';

export type NativeSessionReceipt = Readonly<{
    sessionID: string;
    title: string;
    nonce: string;
    scope: 'customer' | 'playground';
    binding: string;
}>;
export type NativeAccessCheck = (receipt: NativeSessionReceipt) => Promise<boolean>;
export type NativeSessionState = {
    outcome?: 'succeeded' | 'failed' | 'interrupted';
    time: { created: number; updated: number; busy?: number; idle?: number };
};
export type NativeMessage =
    | { id: string; type: 'user'; text: string; created: number }
    | { id: string; type: 'assistant'; text: string; created: number; completed?: number; failed: boolean; retrying: boolean }
    | { id: string; type: 'idle'; outcome: 'succeeded' | 'failed' | 'interrupted'; created: number }
    | { id: string; type: 'activity'; created: number };
export class NativeSessionError extends Error {
    readonly code: 'unavailable' | 'version_mismatch' | 'forbidden';
    readonly outcome: 'not_dispatched' | 'unknown';
    constructor(
        code: NativeSessionError['code'] = 'unavailable',
        outcome: NativeSessionError['outcome'] = 'not_dispatched',
    ) {
        super(code);
        this.name = 'NativeSessionError';
        this.code = code;
        this.outcome = outcome;
    }
}

// Native 2.2.2 identifier.ts: 48-bit time/counter followed by fourteen base-62 characters.
function nativeID(descending: boolean) {
    const timestamp = BigInt(Date.now()) * 0x1000n + 1n;
    const value = descending ? ~timestamp : timestamp;
    const time = Array.from({ length: 6 }, (_, i) => Number((value >> BigInt(40 - i * 8)) & 0xffn).toString(16).padStart(2, '0')).join('');
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    return time + Array.from(randomBytes(14), byte => chars[byte % 62]).join('');
}
export function createNativeMessageID(): string { return 'msg_' + nativeID(false); }

// Persist this receipt before create; the binding is an opaque server HMAC, never a Clerk subject.
export function createNativeReceipt(scope: NativeSessionReceipt['scope'], binding: string): NativeSessionReceipt {
    if (!['customer', 'playground'].includes(scope) || typeof binding !== 'string' || !/^[a-f0-9]{64}$/.test(binding)) throw new NativeSessionError();
    const nonce = randomBytes(16).toString('hex');
    return Object.freeze({ sessionID: 'ses_' + nativeID(true), title: `panda-agent-${scope}-${nonce}`, nonce, scope, binding });
}
