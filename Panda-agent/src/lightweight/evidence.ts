import { answerQuestion } from '../retrieval/answers.ts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import type { Adapters, Outcome } from '../retrieval/contracts.ts';
import { prepareSelect, type WireResult, type SelectionMode, type createLightweightClient } from './client.ts';

type RagClient = Parameters<typeof createInsforgeAdapters>[0];
type Client = ReturnType<typeof createLightweightClient>;
type EvidenceInput = {
  subject:string; sessionId:string; turnId:string; productSku:string; question:string; physicalRevision?:string;
  ragClient:RagClient | null; client:Pick<Client,'select'>;
  beforeDispatch: (metadata:{requestBodySha256:string;productSku:string}) => Promise<void>;
  observeContext?: (counts:{fragments:number;units:number}) => Promise<void>;
  activity?: Adapters['activity'];
  mode?:SelectionMode;
};

// The caller owns authentication, RAG target selection and durable admission/source fences.
export async function answerWithLightweight(input:EvidenceInput):Promise<{outcome:Outcome; wire:WireResult | 'unknown' | null}> {
  if (!input.ragClient || !input.client || typeof input.beforeDispatch !== 'function' || (input.mode!==undefined && input.mode!=='deterministic-mcu-v1')) return {outcome:{kind:'unavailable'},wire:null};
  let wire:WireResult | 'unknown' | null = null;
  const adapters = createInsforgeAdapters(input.ragClient, async (question, fragments, context) => {
    if (!context || (input.mode==='deterministic-mcu-v1' && !context.completeEligibleScope) || !await context.revalidate()) throw Error('Source no longer current');
    const prepared = prepareSelect({turnId:input.turnId,productSku:input.productSku,question,fragments,...(input.mode ? {mode:input.mode} : {})});
    await input.observeContext?.({fragments:prepared.input.fragments.length,units:prepared.input.fragments.reduce((n,f)=>n+f.text.length,0)});
    await input.beforeDispatch({requestBodySha256:prepared.requestBodySha256,productSku:input.productSku});
    if (!await context.revalidate()) throw Error('Source no longer current');
    try { wire = await input.client.select({subject:input.subject,sessionId:input.sessionId,prepared}); }
    catch { wire = 'unknown'; throw Error('Selection unavailable'); }
    if (wire.state !== 'complete') throw Error('Selection unavailable');
    return {selections:wire.selections};
  });
  if(input.mode==='deterministic-mcu-v1') adapters.lexical=async (_question,handles)=>handles.length<=8 ? handles : [];
  const resolveIdentity = adapters.resolveIdentity;
  adapters.resolveIdentity = async (actor, question) => {
    const identity = await resolveIdentity(actor, question);
    return identity.kind === 'resolved' && identity.product.sku !== input.productSku ? {kind:'clarification'} : identity;
  };
  adapters.activity = input.activity;
  const outcome = await answerQuestion({subject:input.subject},{question:input.question,productSku:input.productSku,...(input.physicalRevision === undefined ? {} : {physicalRevision:input.physicalRevision})},adapters);
  return {outcome,wire};
}
