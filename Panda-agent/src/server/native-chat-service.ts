import type { ChatActor, ChatRead } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import { createNativeRunStore } from './native-run-store.ts';
import { createNativeOwnerAdmission } from './native-owner.ts';
import { createNativeRuntimeAdmission } from './native-runtime.ts';
import { createNativeTurn } from './native-turn.ts';
import { createNativeLifecycle } from './native-lifecycle.ts';
import { createLightweightStore } from './lightweight-store.ts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import { prepareEvidenceContext } from '../retrieval/prepared-evidence.ts';

type Turn = { thread: string; request: string; question: string };
type Reference = { thread: string; request: string };
export type NativeChatBridge = {
    read(thread: string): Promise<ChatRead>;
    state: ReturnType<typeof createNativeRunStore>['state'];
    start(input: Turn, signal?: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
    status(input: Turn, signal?: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
    cancel(input: Reference, signal?: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' | 'retired' }>;
    cleanup(input: Reference, signal?: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' | 'retired' }>;
    cleanupThread(thread: string, signal?: AbortSignal): Promise<boolean>;
};

// Request-scoped assembly only: OpenCode owns execution; these adapters own identity/persistence/release.
export function createNativeChatService(actor: ChatActor, options: {
    key: string;
    current(actor: ChatActor): Promise<boolean>;
    runtime: ReturnType<typeof createNativeRuntimeAdmission>;
}): NativeChatBridge {
    const captured = Object.freeze({ subject: actor.subject, sessionId: actor.sessionId, client: actor.client });
    const store = createNativeRunStore(captured, options.key);
    const owner = createNativeOwnerAdmission({ actor: captured, key: options.key, current: options.current, read: store.read, state: store.state });
    const scopes = createLightweightStore(captured, options.key);
    const base = { store, current: owner.current, ownerBinding: owner.ownerBinding };
    const drivers = async (input: Reference, signal?: AbortSignal) => {
        const reference = { thread: input.thread, request: input.request };
        if (!await owner.current(reference)) throw new ChatStoreError('unauthenticated');
        const connection = await options.runtime.connection(signal);
        if (!connection) throw new ChatStoreError('unavailable');
        const dependencies = { ...base, native: connection.native, authorizeRuntime: (purpose: 'dispatch' | 'observe') => connection.authorize(purpose, signal),
            prepareEvidence: (question: string) => prepareEvidenceContext({
                actor: { subject: captured.subject }, input: { question },
                adapters: createInsforgeAdapters(captured.client, async () => { throw new ChatStoreError('unavailable'); }),
                current: () => owner.current(reference), readScope: product => scopes.scope(product.id),
            }),
        };
        return { turn: createNativeTurn(dependencies), lifecycle: createNativeLifecycle(dependencies) };
    };
    const service: NativeChatBridge = {
        read: store.read, state: store.state,
        async start(input, signal) {
            // No environment switch/descriptor can supply the missing strict-ZDR/zero-cost proof.
            if (await options.runtime.authorize('dispatch', signal) === null) throw new ChatStoreError('unavailable');
            return (await drivers(input, signal)).turn.start(input, signal);
        },
        async status(input, signal) {
            const saved = await store.state(input.thread, input.request);
            if (!saved) throw new ChatStoreError('not_found');
            if (!await owner.current({ thread: input.thread, request: input.request, receipt: saved.receipt })) throw new ChatStoreError('unauthenticated');
            if (saved.phase === 'terminal') return { status: 'saved' };
            const driver = await drivers(input, signal);
            if (!saved.cancelRequested) return driver.turn.status(input, signal);
            const result = await driver.lifecycle.status({ thread: input.thread, request: input.request }, signal);
            return { status: result.status === 'retired' ? 'unknown' : result.status };
        },
        async cancel(input, signal) {
            const saved = await store.state(input.thread, input.request);
            if (!saved) throw new ChatStoreError('not_found');
            if (!await owner.current({ ...input, receipt: saved.receipt })) throw new ChatStoreError('unauthenticated');
            if (saved.phase === 'terminal') return { status: 'saved' };
            return (await drivers(input, signal)).lifecycle.cancel(input, signal);
        },
        async cleanup(input, signal) {
            const saved = await store.state(input.thread, input.request);
            if (!saved) throw new ChatStoreError('not_found');
            if (!await owner.current({ ...input, receipt: saved.receipt })) throw new ChatStoreError('unauthenticated');
            if (saved.runtimeRetired) return { status: 'retired' };
            return (await drivers(input, signal)).lifecycle.cleanup(input, signal);
        },
        async cleanupThread(thread, signal) {
            const bounded = AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]);
            if (bounded.aborted || !await options.current(captured)) throw new ChatStoreError('unauthenticated');
            const candidates = await store.contexts(thread);
            if (candidates.pending) return false;
            for (const request of candidates.requests) {
                if (bounded.aborted) return false;
                try { if ((await service.cleanup({ thread, request }, bounded)).status !== 'retired') return false; }
                catch { return false; }
            }
            return !candidates.more && !bounded.aborted && await options.current(captured);
        },
    };
    return service;
}
