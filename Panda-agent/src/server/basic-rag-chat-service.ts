import { runBasicRag } from '../retrieval/basic-rag.ts';
import type { ReadyProductContext } from '../retrieval/product-context-set.ts';
import { uuid, type ActivityReporter, type ChatAnswer, type ChatRead } from './chat-contracts.ts';
import type { BasicRagChatBridge, BasicRagReference, BasicRagTurn } from './basic-rag-chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';

type State = { question: string; status: 'pending' | 'complete'; prepared: boolean; cancelled: boolean };
type Scope = { productId: string; sku: string; scopeHash: string };
type Prepared = ReadyProductContext | { kind: 'clarification' | 'insufficient' | 'unavailable' };
type Completion = (input: { question: string; passages: Array<{ rank: number; text: string }> }, beforeSend: () => Promise<boolean>, signal: AbortSignal) => Promise<{ evaluation: unknown; usage?: unknown }>;
type Dependencies = {
  store: {
    state(thread: string, request: string): Promise<State | null>;
    begin(thread: string, request: string, question: string): Promise<ChatRead & { admitted: boolean }>;
    scope(productId: string): Promise<Scope>;
    prepare(thread: string, request: string, question: string, scope: Scope, digest: string): Promise<boolean>;
    complete(thread: string, request: string, answer: ChatAnswer): Promise<ChatRead>;
    cancel(thread: string, request: string): Promise<ChatRead>;
  };
  current(): Promise<boolean>;
  enabled(): Promise<boolean>;
  prepareContext(question: string, signal: AbortSignal): Promise<Prepared>;
  completion(claim: () => Promise<boolean>): Completion;
};

const unavailable = (): ChatStoreError => new ChatStoreError('unavailable');
const safeError = (error: unknown): ChatStoreError => error instanceof ChatStoreError ? error : unavailable();
const validReference = ({ thread, request }: BasicRagReference) => uuid(thread) && uuid(request) && request === request.toLowerCase();
const resultFor = (state: State): { status: 'saved' | 'pending' | 'unknown' } => ({
  status: state.status === 'complete' ? 'saved' : state.prepared ? 'unknown' : 'pending',
});
const fixedAnswer = (status: 'clarification' | 'insufficient' | 'unavailable'): ChatAnswer => ({
  outcome: status === 'clarification' ? 'clarification' : 'insufficient',
  text: status === 'clarification' ? 'Please include one exact PandaByte product name or model.'
    : status === 'insufficient' ? 'The available approved sources do not establish an answer to this question.'
      : 'A grounded response is unavailable right now. No automatic retry was made.',
  citations: [],
});

export function createBasicRagChatService(deps: Dependencies): BasicRagChatBridge {
  const current = async () => { try { return await deps.current() === true; } catch { return false; } };
  const requireCurrent = async () => { if (!await current()) throw new ChatStoreError('unauthenticated'); };
  async function readState(ref: BasicRagReference, signal?: AbortSignal): Promise<State | null> {
    if (!validReference(ref)) throw new ChatStoreError('invalid');
    if (signal?.aborted) throw unavailable();
    await requireCurrent();
    const value = await deps.store.state(ref.thread, ref.request);
    await requireCurrent();
    if (signal?.aborted) throw unavailable();
    if (value === null) return null;
    if (!value || typeof value !== 'object' || typeof value.question !== 'string' || !value.question.trim()
      || value.question.length > 2000 || !value.question.isWellFormed() || !['pending', 'complete'].includes(value.status)
      || typeof value.prepared !== 'boolean' || typeof value.cancelled !== 'boolean'
      || (value.cancelled && value.status !== 'complete')) throw unavailable();
    return value;
  }
  async function status(ref: BasicRagReference, signal: AbortSignal) {
    try {
      const value = await readState(ref, signal);
      if (!value) throw new ChatStoreError('not_found');
      return resultFor(value);
    } catch (error) { throw safeError(error); }
  }
  const report = (progress: ActivityReporter | undefined, stage: Parameters<ActivityReporter>[0]) => {
    try { progress?.(stage); } catch { /* Presentation cannot change admission or persistence. */ }
  };
  return {
    async state(thread, request) {
      try { return await readState({ thread, request }) !== null; }
      catch (error) { throw safeError(error); }
    },
    status,
    async cancel(ref, signal) {
      try {
        const state = await readState(ref, signal);
        if (!state) throw new ChatStoreError('not_found');
        if (state.status === 'complete') return { status: 'saved' };
        if (signal.aborted) throw unavailable();
        await requireCurrent();
        await deps.store.cancel(ref.thread, ref.request);
        const after = await readState(ref, signal);
        return after ? resultFor(after) : { status: 'unknown' };
      } catch (error) { throw safeError(error); }
    },
    async start(turn: BasicRagTurn, signal, progress) {
      try {
        if (!validReference(turn) || typeof turn.question !== 'string' || !turn.question.trim()
          || turn.question !== turn.question.trim() || !turn.question.isWellFormed() || turn.question.length > 2000
          || Buffer.byteLength(turn.question, 'utf8') > 8192) throw new ChatStoreError('invalid');
        const ref = { thread: turn.thread, request: turn.request };
        const existing = await readState(ref, signal);
        if (existing) {
          if (existing.question !== turn.question) throw new ChatStoreError('conflict');
          return resultFor(existing);
        }
        if (signal.aborted || await deps.enabled() !== true || signal.aborted) throw unavailable();
        await requireCurrent();
        const started = await deps.store.begin(turn.thread, turn.request, turn.question);
        await requireCurrent();
        if (signal.aborted) return { status: 'unknown' };
        const admitted = started.turns.find(item => item.requestId === turn.request);
        if (!admitted || admitted.question !== turn.question || typeof started.admitted !== 'boolean') throw unavailable();
        if (admitted.status === 'complete') return { status: 'saved' };
        if (!started.admitted) return status(ref, signal);

        let context: ReadyProductContext | undefined, claimUsed = false, claimIndeterminate = false;
        const claim = async () => {
          if (claimUsed) { claimIndeterminate = true; return false; }
          claimUsed = true;
          if (signal.aborted || !await current()) return false;
          const selected = context?.products.length === 1 ? context.products[0] : undefined;
          const digest = context?.digest;
          if (!selected || !uuid(selected.id) || typeof selected.sku !== 'string' || !selected.sku.trim()
            || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) { claimIndeterminate = true; return false; }
          const scope = await deps.store.scope(selected.id);
          if (!scope || scope.productId !== selected.id || scope.sku !== selected.sku || !/^[a-f0-9]{64}$/.test(scope.scopeHash)) {
            claimIndeterminate = true; return false;
          }
          if (signal.aborted || !await current()) return false;
          claimIndeterminate = true;
          const claimed = await deps.store.prepare(turn.thread, turn.request, turn.question, scope, digest);
          if (claimed === true) claimIndeterminate = false;
          return claimed === true;
        };
        const complete = deps.completion(claim);
        const result = await runBasicRag({ question: turn.question, signal }, {
          authorize: current,
          prepare: async (question, requestSignal) => {
            report(progress, 'reading_sources');
            const value = await deps.prepareContext(question, requestSignal);
            if (value.kind === 'ready') context = value;
            return value;
          },
          complete: async (input, beforeSend, requestSignal) => {
            report(progress, 'selecting_evidence');
            return complete(input, beforeSend, requestSignal);
          },
        });
        if (signal.aborted) return { status: 'unknown' };
        await requireCurrent();
        if (result.status === 'outcome_unknown' || claimIndeterminate) {
          const after = await readState(ref, signal);
          return after?.status === 'complete' ? { status: 'saved' } : { status: 'unknown' };
        }
        if (result.status === 'invalid') throw new ChatStoreError('invalid');
        const answer = result.status === 'answered' ? result.answer : fixedAnswer(result.status);
        if (result.status === 'answered') report(progress, 'checking_citations');
        if (signal.aborted) return { status: 'unknown' };
        await requireCurrent();
        report(progress, 'saving_answer');
        try { await deps.store.complete(turn.thread, turn.request, answer); }
        catch {
          const after = await readState(ref, signal);
          return after?.status === 'complete' ? { status: 'saved' } : { status: 'unknown' };
        }
        const after = await readState(ref, signal);
        return after ? resultFor(after) : { status: 'unknown' };
      } catch (error) { throw safeError(error); }
    },
  };
}
