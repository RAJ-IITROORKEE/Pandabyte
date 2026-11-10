import 'server-only';
import { createHmac } from 'node:crypto';
import { runNativeAssistant } from '../opencode/native-assistant-runner.ts';
import { nativeExecutionAvailable } from '../../scripts/start-native-execution.mjs';
import { createPlainLlmChatService, createPlainLlmStore } from './plain-llm-chat.ts';
import { createLunaNativeCompletion } from './luna-native-openrouter.ts';
import { createLunaPrototypePolicy } from './basic-rag-runtime.ts';
import { readLunaPrototypeProfile } from './luna-prototype-profile.ts';
import { BasicRagProviderError } from './basic-rag-openrouter.ts';
import { currentLightweightSession } from './lightweight-connection';
import type { ChatActor } from './chat-contracts.ts';

export function createNativeAssistantChat(options: {
  actor: ChatActor; key: string; current(): Promise<boolean>;
  store: ReturnType<typeof createPlainLlmStore>; policy: ReturnType<typeof createLunaPrototypePolicy>;
  run?: typeof runNativeAssistant; available?: typeof nativeExecutionAvailable;
}) {
  const { actor, key, store, policy, current } = options;
  return createPlainLlmChatService({ store, current,
    enabled: async () => /^[a-f0-9]{64}$/.test(key) && await (options.available ?? nativeExecutionAvailable)(process.cwd()) && await policy.enabled(),
    complete: (request, question, claim, thread) => async (_input, beforeSend, signal) => {
      let admission: Parameters<typeof runNativeAssistant>[0]['saveAdmission'] extends (a: infer A) => unknown ? A : never;
      let persisted = false;
      const binding = createHmac('sha256', Buffer.from(key, 'hex')).update('panda-native-root-v1\n' + JSON.stringify([actor.subject, actor.sessionId, thread, request, policy.binding()])).digest('hex');
      const result = await (options.run ?? runNativeAssistant)({ question, owner: actor.subject, rootRun: request, binding, signal, workspaceRoot: process.cwd(),
        current: async value => {
          if (signal.aborted || !policy.dispatchCurrent()) return false;
          // The signed admission check already includes pending/cancelled state.
          if (value) return await store.admissionCurrent(thread, request, value) && await current() && !signal.aborted && policy.dispatchCurrent();
          return await beforeSend();
        },
        saveAdmission: async value => { admission = value; return await store.attach(thread, request, value); },
        claimCreate: value => store.nativeClaim(thread, request, value, 'create'),
        claimPrompt: value => store.nativeClaim(thread, request, value, 'prompt'),
        reserve: async call => await claim() && policy.claimBudget({ request, surface: 'chat', fingerprint: call.bodyHash }),
        complete: createLunaNativeCompletion({ apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent }),
        receipt: async (call, usage) => { if (!admission || !await current()) throw new BasicRagProviderError('outcome_unknown'); await store.recordReceipt(thread, request, admission, call.bodyHash, usage); },
        onSucceeded: async ({ artifact }) => {
          if (!await beforeSend() || !await current() || !['answer','clarification'].includes(artifact.type)) return false;
          const text = artifact.type === 'answer' ? artifact.answer : artifact.type === 'clarification' ? artifact.question : '';
          await store.finish(thread, request, { outcome: 'conversation', text, citations: [] });
          persisted = await current(); return persisted;
        },
      });
      if (result.status !== 'succeeded' || !persisted) throw new BasicRagProviderError('outcome_unknown');
      if (result.contextRetired === true) {
        try { await store.retire(thread, request, admission!); }
        catch { /* Saved answer remains valid; deletion stays fenced until retirement is confirmed. */ }
      }
      return { answer: result.artifact.type === 'answer' ? result.artifact.answer : result.artifact.type === 'clarification' ? result.artifact.question : '', usage: result.usage, persisted: true };
    },
  });
}

export function nativeAssistantForActor(actor: ChatActor, request: Request) {
  const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
  const input = { env: process.env, subject: actor.subject, requestOrigin: new URL(request.url).origin, actor, current };
  const policy = createLunaPrototypePolicy({ ...input, profile: () => readLunaPrototypeProfile({ ...input, nativePreview: true }) });
  const key = process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '';
  return createNativeAssistantChat({ actor, key, store: createPlainLlmStore(actor, key), current, policy });
}
