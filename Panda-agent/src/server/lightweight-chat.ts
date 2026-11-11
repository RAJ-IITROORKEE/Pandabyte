import 'server-only';
import { listRuntimeProducts } from '../retrieval/insforge-adapters';
import { authenticateLightweight, currentLightweightSession } from './lightweight-connection';
import { createLightweightHandler } from './lightweight-handler';
import { createLightweightStore } from './lightweight-store';
import { basicRagForActor } from './basic-rag-runtime';
import { directAssistantForActor, researchWebSearchEnabled } from './direct-assistant-runtime';
import { ChatStoreError } from './chat-store';

// Existing saved basic-RAG turns retain status and cancellation; no new legacy execution is admitted.
const handlers = createLightweightHandler({
  enabled: () => process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED === 'true',
  authenticate: authenticateLightweight,
  current: actor => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false),
  basicRag: basicRagForActor,
  basicRagNewMessages: () => false,
  ...(process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true' ? { llm: directAssistantForActor } : {}),
  webSearch: () => process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true' && researchWebSearchEnabled(),
  llmNewMessages: () => process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true',
  nativeNewMessages: () => false,
  guideEnabled: () => false,
  diagnosticEnabled: () => false,
  agenticEnabled: () => false,
  store: actor => createLightweightStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? ''),
  products: actor => listRuntimeProducts(actor.client),
  answer: async () => { throw new ChatStoreError('unavailable'); },
  cancel: async () => { throw new ChatStoreError('unavailable'); },
});

export const lightweightChatHandlers = {
  ...handlers,
  messagePOST: (request:Request, id:string) => process.env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED === 'true'
    ? handlers.messagePOST(request,id)
    : Promise.resolve(Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})),
};
