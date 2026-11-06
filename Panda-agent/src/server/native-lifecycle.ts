import type { createNativeSessionClient } from '../opencode/session-client.ts';
import type { NativeSessionReceipt } from '../opencode/session-contracts.ts';
import { correlateNativeTurn } from '../opencode/turn-result.ts';
import { uuid, type ChatAnswer } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import type { createNativeRunStore, NativeRunState } from './native-run-store.ts';
import type { NativeTurnDependencies } from './native-turn.ts';

type Input = { thread: string; request: string };
export type NativeLifecycleResult = { status: 'pending' | 'unknown' | 'saved' | 'retired' };
export type NativeLifecycleDependencies = Pick<NativeTurnDependencies, 'current' | 'authorizeRuntime' | 'ownerBinding'> & {
    store: Pick<ReturnType<typeof createNativeRunStore>, 'state' | 'transition' | 'complete' | 'claimRemoval' | 'retire'>;
    native: Pick<ReturnType<typeof createNativeSessionClient>, 'get' | 'messages' | 'active' | 'interrupt' | 'remove' | 'absence'>;
};
const unknown = (): NativeLifecycleResult => ({ status: 'unknown' });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const immutable = (run: NativeRunState) => ({ receipt: run.receipt, messageID: run.messageID, promptHash: run.promptHash, runtimeBinding: run.runtimeBinding, scopes: run.scopes });
const cancelled: ChatAnswer = { outcome: 'insufficient', text: 'This request was cancelled. Start a new question when ready.', citations: [] };
const unavailable: ChatAnswer = { outcome: 'insufficient', text: 'This request ended without a current validated result. No uncertain request was repeated. Start a new question.', citations: [] };

// Cancellation/cleanup translate owned native operations; current source-checked answer projection stays elsewhere.
export function createNativeLifecycle(deps: NativeLifecycleDependencies) {
    async function run(input: Input, action: 'cancel' | 'status' | 'cleanup', signal?: AbortSignal): Promise<NativeLifecycleResult> {
        if (!input || Object.keys(input).sort().join(',') !== 'request,thread' || !uuid(input.thread) || !uuid(input.request)) throw new ChatStoreError('invalid');
        const { thread, request } = input;
        try {
            const guard = async (receipt?: NativeSessionReceipt, binding?: string) => {
                if (signal?.aborted) throw new ChatStoreError('unavailable');
                if (await deps.current({ thread, request, ...(receipt ? { receipt } : {}) }) !== true) throw new ChatStoreError('unauthenticated');
                const runtime = await deps.authorizeRuntime('observe');
                if (signal?.aborted || typeof runtime !== 'string' || !/^[a-f0-9]{64}$/.test(runtime) || (binding !== undefined && runtime !== binding)) throw new ChatStoreError('unavailable');
            };
            await guard();
            let saved = await deps.store.state(thread, request);
            if (!saved) throw new ChatStoreError('not_found');
            const identity = immutable(saved);
            const owned = async (receipt = identity.receipt) => {
                await guard(receipt, identity.runtimeBinding);
                if (!equal(receipt, identity.receipt) || receipt.scope !== 'customer' || await deps.ownerBinding(thread) !== receipt.binding) throw new ChatStoreError('unavailable');
            };
            const latest = async (receipt = identity.receipt) => {
                await owned(receipt);
                const value = await deps.store.state(thread, request);
                if (!value || !equal(immutable(value), identity)) throw new ChatStoreError('unavailable');
                return value;
            };
            await owned();
            const check = async (receipt: NativeSessionReceipt, mutation?: 'interrupt' | 'remove' | 'absence') => {
                const value = await latest(receipt);
                if (value.runtimeRetired) return false;
                if (mutation === 'remove' || mutation === 'absence') return value.phase === 'terminal' && value.removalClaimed && value.version === saved!.version;
                if (mutation === 'interrupt') return value.phase === 'cancel_requested' && value.cancelRequested && value.version === saved!.version && !value.removalClaimed;
                return value.cancelRequested && !value.removalClaimed;
            };
            if (action === 'cleanup') {
                if (saved.phase !== 'terminal') return unknown();
                if (saved.runtimeRetired) return { status: 'retired' };
                if (!saved.removalClaimed) {
                    if (saved.createClaimed) {
                        const observationCheck = async (receipt: NativeSessionReceipt) => {
                            const value = await latest(receipt);
                            return value.phase === 'terminal' && !value.removalClaimed && !value.runtimeRetired && value.version === saved!.version;
                        };
                        const session = await deps.native.get(saved.receipt, observationCheck, signal);
                        const active = await deps.native.active(saved.receipt, observationCheck, signal);
                        if (active.active || (session.time.busy === undefined ? saved.promptClaimed || session.outcome !== undefined
                            : session.outcome !== saved.nativeOutcome || session.time.idle === undefined || session.time.idle < session.time.busy)) return unknown();
                    }
                    await owned();
                    saved = await deps.store.claimRemoval(thread, request, saved.version);
                    if (saved.createClaimed) {
                        const removed = await deps.native.remove(saved.receipt, receipt => check(receipt, 'remove'), signal);
                        if (removed.status !== 'removed') return unknown();
                    } else {
                        const absent = await deps.native.absence(saved.receipt, receipt => check(receipt, 'absence'), signal);
                        if (absent.absent !== true) return unknown();
                    }
                } else {
                    // A consumed removal claim never authorizes another DELETE, including a lost claim acknowledgement.
                    const absent = await deps.native.absence(saved.receipt, receipt => check(receipt, 'absence'), signal);
                    if (absent.absent !== true) return unknown();
                }
                const verified = await latest();
                if (verified.phase !== 'terminal' || !verified.removalClaimed || verified.runtimeRetired || verified.version !== saved.version) return unknown();
                await owned();
                await deps.store.retire(thread, request, verified.version);
                await owned();
                return { status: 'retired' };
            }
            if (saved.phase === 'terminal') return { status: 'saved' };
            let interrupt = false;
            if (action === 'cancel' && !saved.cancelRequested) {
                await owned();
                saved = await deps.store.transition(thread, request, saved.version, 'cancel_requested');
                interrupt = saved.promptClaimed;
            }
            if (!saved.cancelRequested) return unknown();
            if (interrupt) {
                const result = await deps.native.interrupt(saved.receipt, receipt => check(receipt, 'interrupt'), signal);
                if (result.status === 'unknown') return unknown();
            }
            let outcome: 'succeeded' | 'failed' | 'interrupted' | null = null;
            if (saved.createClaimed) {
                const session = await deps.native.get(saved.receipt, check, signal);
                if (!saved.promptClaimed) {
                    const active = await deps.native.active(saved.receipt, check, signal);
                    // Existence proves create committed. A 404 cannot settle an uncertain create that may arrive later.
                    if (active.active || session.time.busy !== undefined || session.outcome !== undefined) return unknown();
                } else {
                    const messages = await deps.native.messages(saved.receipt, check, signal);
                    const active = await deps.native.active(saved.receipt, check, signal);
                    const result = correlateNativeTurn({ messageID: saved.messageID, promptHash: saved.promptHash }, session, active.active, messages);
                    if (result.state !== 'terminal') return { status: result.state };
                    outcome = result.outcome;
                }
            }
            const current = await latest();
            if (current.phase === 'terminal') return { status: 'saved' };
            if (!current.cancelRequested || current.removalClaimed || current.runtimeRetired) return unknown();
            const isCancelled = outcome === null || outcome === 'interrupted';
            await owned();
            await deps.store.complete(thread, request, current.version, structuredClone(isCancelled ? cancelled : unavailable), outcome, isCancelled ? 'cancelled' : 'unavailable');
            await owned();
            return { status: 'saved' };
        } catch (error) {
            if (error instanceof ChatStoreError && ['invalid', 'unauthenticated', 'not_found'].includes(error.code)) throw error;
            return unknown();
        }
    }
    // A lost/too-early interrupt has no retry lease. Late prompts and ambiguous claims remain retained for later policy work.
    return {
        cancel: (input: Input, signal?: AbortSignal) => run(input, 'cancel', signal),
        status: (input: Input, signal?: AbortSignal) => run(input, 'status', signal),
        cleanup: (input: Input, signal?: AbortSignal) => run(input, 'cleanup', signal),
    };
}
