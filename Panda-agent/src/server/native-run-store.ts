import { createHmac } from 'node:crypto';
import type { NativeSessionReceipt } from '../opencode/session-contracts.ts';
import { uuid, type ChatActor, type ChatAnswer } from './chat-contracts.ts';
import { ChatStoreError, cleanAnswer } from './chat-store.ts';

export type NativeRunScope = { productId: string; scopeHash: string };
export type NativeRunEvent = 'claim_create' | 'created' | 'claim_prompt' | 'accepted' | 'cancel_requested' | 'unknown';
export type NativeRunTerminalReason = 'answered' | 'cancelled' | 'unavailable';
export type NativeRunOutcome = 'succeeded' | 'failed' | 'interrupted';
export type NativeRunState = {
    receipt: NativeSessionReceipt;
    messageID: string;
    promptHash: string;
    runtimeBinding: string;
    scopes: NativeRunScope[];
    phase: 'admitted' | 'create_claimed' | 'created' | 'prompt_claimed' | 'accepted' | 'cancel_requested' | 'unknown' | 'terminal';
    version: number;
    createClaimed: boolean;
    promptClaimed: boolean;
    cancelRequested: boolean;
    terminalReason: NativeRunTerminalReason | null;
    nativeOutcome: NativeRunOutcome | null;
    responseHash: string | null;
    runtimeRetired: boolean;
};
export type NativeRunAdmitInput = {
    thread: string; request: string; question: string; receipt: NativeSessionReceipt;
    messageID: string; promptHash: string; runtimeBinding: string; scopes: NativeRunScope[];
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/\p{Surrogate}/u.test(value);
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const terminalReason = (value: unknown): value is NativeRunTerminalReason => ['answered', 'cancelled', 'unavailable'].includes(value as string);
const nativeOutcome = (value: unknown): value is NativeRunOutcome => ['succeeded', 'failed', 'interrupted'].includes(value as string);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function requireValue(value: unknown, code: 'invalid' | 'unavailable'): asserts value { if (!value) throw new ChatStoreError(code); }

function receipt(value: unknown, code: 'invalid' | 'unavailable'): NativeSessionReceipt {
    requireValue(object(value) && exact(value, ['sessionID', 'title', 'nonce', 'scope', 'binding'])
        && typeof value.sessionID === 'string' && /^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(value.sessionID)
        && value.scope === 'customer' && typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce)
        && value.title === `panda-agent-customer-${value.nonce}` && hex(value.binding), code);
    return { sessionID: value.sessionID, title: value.title, nonce: value.nonce, scope: value.scope, binding: value.binding };
}
function scopes(value: unknown, code: 'invalid' | 'unavailable'): NativeRunScope[] {
    requireValue(Array.isArray(value) && value.length <= 4 && value.every(item => object(item) && exact(item, ['productId', 'scopeHash']) && uuid(item.productId) && hex(item.scopeHash))
        && new Set(value.map(item => item.productId.toLowerCase())).size === value.length, code);
    return value.map(item => ({ productId: item.productId, scopeHash: item.scopeHash }));
}
function state(value: unknown): NativeRunState {
    requireValue(object(value) && exact(value, ['receipt', 'messageID', 'promptHash', 'runtimeBinding', 'scopes', 'phase', 'version', 'createClaimed', 'promptClaimed', 'cancelRequested', 'terminalReason', 'nativeOutcome', 'responseHash', 'runtimeRetired'])
        && typeof value.messageID === 'string' && /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(value.messageID) && hex(value.promptHash) && hex(value.runtimeBinding)
        && ['admitted', 'create_claimed', 'created', 'prompt_claimed', 'accepted', 'cancel_requested', 'unknown', 'terminal'].includes(value.phase as string)
        && positive(value.version) && typeof value.createClaimed === 'boolean' && typeof value.promptClaimed === 'boolean' && typeof value.cancelRequested === 'boolean' && typeof value.runtimeRetired === 'boolean'
        && (value.terminalReason === null || terminalReason(value.terminalReason)) && (value.nativeOutcome === null || nativeOutcome(value.nativeOutcome)) && (value.responseHash === null || hex(value.responseHash)), 'unavailable');
    requireValue((!value.promptClaimed || value.createClaimed)
        && (value.phase !== 'admitted' || (!value.createClaimed && !value.promptClaimed && !value.cancelRequested))
        && (!['create_claimed', 'created'].includes(value.phase as string) || value.createClaimed)
        && (!['prompt_claimed', 'accepted'].includes(value.phase as string) || (value.createClaimed && value.promptClaimed))
        && (value.phase !== 'cancel_requested' || value.cancelRequested) && (!value.runtimeRetired || value.phase === 'terminal')
        && (value.phase === 'terminal'
            ? value.terminalReason !== null && value.responseHash !== null && (value.terminalReason !== 'cancelled' || !value.promptClaimed || value.nativeOutcome === 'interrupted')
            : value.terminalReason === null && value.responseHash === null && value.nativeOutcome === null), 'unavailable');
    return {
        receipt: receipt(value.receipt, 'unavailable'), messageID: value.messageID, promptHash: value.promptHash, runtimeBinding: value.runtimeBinding, scopes: scopes(value.scopes, 'unavailable'),
        phase: value.phase as NativeRunState['phase'], version: value.version, createClaimed: value.createClaimed, promptClaimed: value.promptClaimed, cancelRequested: value.cancelRequested,
        terminalReason: value.terminalReason as NativeRunState['terminalReason'], nativeOutcome: value.nativeOutcome as NativeRunState['nativeOutcome'], responseHash: value.responseHash as string | null,
        runtimeRetired: value.runtimeRetired,
    };
}

// Private actor-scoped persistence only; native execution and lifecycle admission stay with the caller.
export function createNativeRunStore(actor: ChatActor, key: string) {
    requireValue(hex(key) && object(actor) && text(actor.subject, 512), 'unavailable');
    const subject = actor.subject;
    function identity(thread: string, request: string) { requireValue(uuid(thread) && uuid(request), 'invalid'); return { thread, request }; }
    async function rpc(action: 'admit' | 'state' | 'transition' | 'complete' | 'retire', input: Record<string, unknown>): Promise<unknown> {
        const p_payload = JSON.stringify({ v: 1, action, subject, exp: Math.floor(Date.now() / 1000) + 60, input });
        requireValue(Buffer.byteLength(p_payload, 'utf8') <= 32768, 'invalid');
        const p_mac = createHmac('sha256', Buffer.from(key, 'hex')).update('panda-native-db-v1\n' + p_payload).digest('hex');
        let result;
        try { result = await actor.client.database.schema('public').rpc(`panda_agent_native_${action}`, { p_payload, p_mac }); }
        catch { throw new ChatStoreError('unavailable'); }
        requireValue(object(result), 'unavailable');
        if (result.error) {
            const error = object(result.error) ? result.error : {};
            const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
            throw new ChatStoreError(error.code === 'P0001' ? known.find(code => code === error.details) ?? 'unavailable' : 'unavailable');
        }
        return result.data;
    }
    return {
        async admit(input: NativeRunAdmitInput): Promise<{ admitted: boolean; state: NativeRunState }> {
            requireValue(object(input) && exact(input, ['thread', 'request', 'question', 'receipt', 'messageID', 'promptHash', 'runtimeBinding', 'scopes'])
                && text(input.question, 2000) && typeof input.messageID === 'string' && /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(input.messageID) && hex(input.promptHash) && hex(input.runtimeBinding), 'invalid');
            const prepared = { ...identity(input.thread, input.request), question: input.question, receipt: receipt(input.receipt, 'invalid'), messageID: input.messageID, promptHash: input.promptHash, runtimeBinding: input.runtimeBinding, scopes: scopes(input.scopes, 'invalid') };
            const result = await rpc('admit', prepared);
            requireValue(object(result) && exact(result, ['admitted', 'state']) && typeof result.admitted === 'boolean', 'unavailable');
            const saved = state(result.state);
            requireValue(saved.messageID === prepared.messageID && saved.promptHash === prepared.promptHash && saved.runtimeBinding === prepared.runtimeBinding
                && JSON.stringify(saved.receipt) === JSON.stringify(prepared.receipt) && JSON.stringify(saved.scopes) === JSON.stringify(prepared.scopes), 'unavailable');
            return { admitted: result.admitted, state: saved };
        },
        async state(thread: string, request: string): Promise<NativeRunState | null> {
            const result = await rpc('state', identity(thread, request));
            return result === null ? null : state(result);
        },
        async transition(thread: string, request: string, expectedVersion: number, event: NativeRunEvent): Promise<NativeRunState> {
            requireValue(positive(expectedVersion) && ['claim_create', 'created', 'claim_prompt', 'accepted', 'cancel_requested', 'unknown'].includes(event), 'invalid');
            const saved = state(await rpc('transition', { ...identity(thread, request), expectedVersion, event }));
            const phase = event === 'claim_create' ? 'create_claimed' : event === 'claim_prompt' ? 'prompt_claimed' : event;
            requireValue(saved.version === expectedVersion + 1 && saved.phase === phase, 'unavailable');
            return saved;
        },
        async complete(thread: string, request: string, expectedVersion: number, answer: ChatAnswer, outcome: NativeRunOutcome | null, reason: NativeRunTerminalReason): Promise<NativeRunState> {
            requireValue(positive(expectedVersion) && (outcome === null || nativeOutcome(outcome)) && terminalReason(reason), 'invalid');
            let cleaned;
            try { cleaned = cleanAnswer(answer); } catch { throw new ChatStoreError('invalid'); }
            const saved = state(await rpc('complete', { ...identity(thread, request), expectedVersion, answer: cleaned, nativeOutcome: outcome, terminalReason: reason }));
            requireValue(saved.phase === 'terminal' && saved.version >= expectedVersion && saved.nativeOutcome === outcome && saved.terminalReason === reason, 'unavailable');
            return saved;
        },
        async retire(thread: string, request: string, expectedVersion: number): Promise<NativeRunState> {
            requireValue(positive(expectedVersion), 'invalid');
            const saved = state(await rpc('retire', { ...identity(thread, request), expectedVersion }));
            requireValue(saved.phase === 'terminal' && saved.runtimeRetired && saved.version >= expectedVersion, 'unavailable');
            return saved;
        },
    };
}
