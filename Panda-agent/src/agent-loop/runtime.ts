import 'server-only';
import type { HostedDirectModelId } from '../hosted-model.ts';
import { prepareQuestionEvidence } from '../retrieval/answers.ts';
import { createInsforgeAdapters, readRuntimeCatalog } from '../retrieval/insforge-adapters.ts';
import type { BasicRagChatBridge } from '../server/basic-rag-chat-contracts.ts';
import type { ChatActor } from '../server/chat-contracts.ts';
import { createAgentLoopChat } from './chat.ts';
import { createOpenRouterStep } from './openrouter-step.ts';
import { createAgentLoopStore } from './store.ts';
import type { ProductRead } from './tools.ts';

type Row = Awaited<ReturnType<typeof readRuntimeCatalog>>[number];
/** One product's eligible listing passages through the same scoped, proof-checked reader as cited answers, bound to that product. */
async function readProduct(actor: ChatActor, row: Row, focus: string, signal: AbortSignal): Promise<ProductRead> {
  const adapters = createInsforgeAdapters(actor.client, async () => ({ selections: [] }));
  const evidence = await prepareQuestionEvidence({ subject: actor.subject }, { question: focus ? `${row.title} ${focus}` : row.title, productSku: row.sku },
    { ...adapters, ranking: { mode: 'lexical' }, resolveIdentity: async () => ({ kind: 'resolved', product: { id: row.id, sku: row.sku } }) });
  if (signal.aborted || evidence.kind === 'unauthorized' || evidence.kind === 'invalid' || evidence.kind === 'unavailable' || evidence.kind === 'conflict') return { kind: 'unavailable' };
  if (evidence.kind !== 'ready') return { kind: 'insufficient' };
  const handles = evidence.fragments.map(f => f.handle);
  const passages = evidence.fragments.map(f => { const c = evidence.byHandle.get(f.handle)!;
    return { text: f.text, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, sectionPath: [...c.sectionPath] }; });
  return { kind: 'ready', passages, revalidate: () => evidence.revalidate(handles) };
}

export function agentLoopChatForActor(options: { actor: ChatActor; key: string; current(): Promise<boolean>; model: HostedDirectModelId;
  policy: Parameters<typeof createAgentLoopChat>[0]['policy'] }): BasicRagChatBridge {
  const { actor } = options;
  return createAgentLoopChat({ store: createAgentLoopStore(actor, options.key), current: options.current, policy: options.policy, model: options.model, step: createOpenRouterStep,
    tools: { catalog: () => readRuntimeCatalog(actor.client), readProduct: (row, focus, signal) => readProduct(actor, row as Row, focus, signal) } });
}
