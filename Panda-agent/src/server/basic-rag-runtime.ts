import 'server-only';
import type { ChatActor } from './chat-contracts.ts';
import { createBasicRagStore } from './basic-rag-store.ts';
import { createBasicRagChatService } from './basic-rag-chat-service.ts';
import { createBasicRagCompletion } from './basic-rag-openrouter.ts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import { prepareProductContextSet } from '../retrieval/product-context-set.ts';
import { currentLightweightSession } from './lightweight-connection';

// A route-intent flag cannot establish provider capacity, privacy or a zero-cost receipt.
// Activation needs a reviewed live profile after the current Phala429 gate is resolved.
export const basicRagAdmissionEnabled = () => false;

export function basicRagForActor(actor: ChatActor) {
  const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
  return createBasicRagChatService({
    store: createBasicRagStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? ''),
    current,
    enabled: async () => basicRagAdmissionEnabled(),
    prepareContext: (question, signal) => prepareProductContextSet({
      actor: { subject: actor.subject }, question, client: actor.client, signal,
      authorizeCurrent: current,
      createAdapters: () => createInsforgeAdapters(actor.client, async () => { throw Error('Selection unavailable'); }),
    }),
    completion: claim => createBasicRagCompletion({
      apiKey: process.env.OPENROUTER_API_KEY ?? '', claim,
      policyCurrent: async () => basicRagAdmissionEnabled(),
    }),
  });
}
