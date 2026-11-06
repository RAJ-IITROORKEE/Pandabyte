import { createHmac } from 'node:crypto';
import type { NativeSessionReceipt } from '../opencode/session-contracts.ts';
import { uuid, type ChatActor, type ChatRead } from './chat-contracts.ts';
import { ChatStoreError, parseChatRead } from './chat-store.ts';
import type { NativeRunState } from './native-run-store.ts';

type Options = {
    actor: ChatActor;
    key: string;
    current(actor: ChatActor): Promise<boolean>;
    read(thread: string): Promise<ChatRead>;
    // MUST use actor/thread/request-authorized native_state SQL, whose journal FK proves the real owned turn.
    state(thread: string, request: string): Promise<NativeRunState | null>;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 512 && value.isWellFormed();
function receipt(value: unknown): NativeSessionReceipt | null {
    if (!object(value) || Object.keys(value).sort().join(',') !== 'binding,nonce,scope,sessionID,title'
        || typeof value.sessionID !== 'string' || !/^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(value.sessionID)
        || typeof value.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(value.nonce) || value.scope !== 'customer'
        || value.title !== `panda-agent-customer-${value.nonce}` || typeof value.binding !== 'string' || !/^[a-f0-9]{64}$/.test(value.binding)) return null;
    return { sessionID: value.sessionID, title: value.title, nonce: value.nonce, scope: value.scope, binding: value.binding };
}

// The supplied read/state callbacks are actor-scoped SQL authorities, never browser data or native IDs.
export function createNativeOwnerAdmission(options: Options) {
    if (!object(options.actor) || !text(options.actor.subject) || !text(options.actor.sessionId) || !object(options.actor.client)) throw new ChatStoreError('unauthenticated');
    if (typeof options.key !== 'string' || !/^[a-f0-9]{64}$/.test(options.key) || !['current', 'read', 'state'].every(key => typeof options[key as 'current' | 'read' | 'state'] === 'function')) throw new ChatStoreError('unavailable');
    const actor = Object.freeze({ subject: options.actor.subject, sessionId: options.actor.sessionId, client: options.actor.client });
    const key = Buffer.from(options.key, 'hex');
    const { current, read, state } = options;
    async function ownerBinding(thread: string): Promise<string> {
        if (!uuid(thread)) throw new ChatStoreError('invalid');
        return createHmac('sha256', key).update('panda-native-owner-v1\n' + JSON.stringify({ subject: actor.subject, thread: thread.toLowerCase() })).digest('hex');
    }
    return {
        ownerBinding,
        async current(input: { thread: string; request: string; receipt?: NativeSessionReceipt }): Promise<boolean> {
            try {
                if (!object(input) || !['request,thread', 'receipt,request,thread'].includes(Object.keys(input).sort().join(',')) || !uuid(input.thread) || !uuid(input.request)) return false;
                const thread = input.thread.toLowerCase(), request = input.request.toLowerCase();
                const hasReceipt = Object.hasOwn(input, 'receipt');
                const supplied = hasReceipt ? receipt(input.receipt) : null;
                if (hasReceipt && !supplied) return false;
                if (supplied && supplied.binding !== await ownerBinding(thread)) return false;
                if (await current(actor) !== true) return false;
                if (supplied) {
                    // Signed native_state is the ownership authority; history reads add no receipt proof and can block cleanup.
                    const saved = await state(thread, request);
                    const durable = saved && receipt(saved.receipt);
                    if (await current(actor) !== true) return false;
                    return durable !== null && JSON.stringify(durable) === JSON.stringify(supplied);
                }
                // Archived chats remain readable for cleanup; SQL admission enforces the dispatch archive fence.
                const owned = parseChatRead(await read(thread));
                if (await current(actor) !== true || owned.thread.id.toLowerCase() !== thread) return false;
                if (new Set(owned.turns.map(turn => turn.requestId.toLowerCase())).size !== owned.turns.length) return false;
                return true; // A fresh request has no journal or turn before native admission.
            } catch { return false; }
        },
    };
}
