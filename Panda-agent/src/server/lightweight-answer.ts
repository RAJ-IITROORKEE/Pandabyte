import { answerWithLightweight } from '../lightweight/evidence.ts';
import { createLightweightClient } from '../lightweight/client.ts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import type { ChatActor, ChatAnswer, ActivityReporter } from './chat-contracts.ts';
import type { createLightweightStore, Execution } from './lightweight-store.ts';
import { ChatStoreError } from './chat-store.ts';

type Store = ReturnType<typeof createLightweightStore>;
type Input = {thread:string;requestId:string;question:string;productSku:string;store:Store;reconcileOnly?:boolean;execution?:Execution};
type Resolve = (actor:ChatActor,input:Input) => ReturnType<ReturnType<typeof createInsforgeAdapters>['resolveIdentity']>;
export function createLightweightAnswer(deps:{
  mode?:'deterministic-mcu-v1';
  current:(subject:string,sessionId:string)=>Promise<boolean>;
  clientForActor:(actor:ChatActor)=>ReturnType<typeof createLightweightClient>;
  resolveIdentity?:Resolve;
  evidence?:typeof answerWithLightweight;
}) {
  const resolve:Resolve = deps.resolveIdentity ?? (async (actor,input) => {
    const adapters=createInsforgeAdapters(actor.client,async()=>{throw Error('Selection not admitted');});
    return adapters.resolveIdentity({subject:actor.subject},{question:input.question,productSku:input.productSku});
  });
  return async (actor:ChatActor,input:Input,request:Request,progress:ActivityReporter):Promise<ChatAnswer> => {
    if(!actor.sessionId || request.signal.aborted)throw new ChatStoreError('unavailable');
    const identity=await resolve(actor,input);
    if(identity.kind!=='resolved') { if(input.reconcileOnly)throw new ChatStoreError('unavailable'); return {outcome:identity.kind,text:'Please clarify which PandaByte product you mean.',citations:[]}; }
    const scope=await input.store.scope(identity.product.id);
    if(input.reconcileOnly && (!input.execution?.prepared || input.execution.productId!==scope.productId || input.execution.sku!==scope.sku || input.execution.scopeHash!==scope.scopeHash))throw new ChatStoreError('unavailable');
    const client=deps.clientForActor(actor);
    let execute=false;
    const result=await (deps.evidence ?? answerWithLightweight)({
      ...(deps.mode ? {mode:deps.mode} : {}),
      subject:actor.subject,sessionId:actor.sessionId,turnId:input.requestId,productSku:scope.sku,question:input.question,ragClient:actor.client,
      beforeDispatch:async({requestBodySha256})=>{
        if(request.signal.aborted || !await deps.current(actor.subject,actor.sessionId!))throw new ChatStoreError('unauthenticated');
        if(input.reconcileOnly) {
          if(!input.execution?.prepared || input.execution.digest!==requestBodySha256)throw new ChatStoreError('unavailable');
        } else execute=await input.store.prepare(input.thread,input.requestId,input.question,scope,requestBodySha256);
      },
      client:{select:async args=>{
        if(request.signal.aborted)throw new ChatStoreError('unavailable');
        progress('selecting_evidence');
        return execute?client.select({...args,signal:request.signal}):client.status({subject:args.subject,sessionId:args.sessionId,turnId:input.requestId,productSku:scope.sku,requestBodySha256:args.prepared.requestBodySha256,fragments:args.prepared.input.fragments,signal:request.signal});
      }},
      activity:progress,
    });
    if(result.wire && result.wire!=='unknown' && result.wire.state==='rejected' && ['disabled','provider_unavailable','quota_exhausted','busy','invalid_selection','budget_exceeded'].includes(result.wire.code)){
      return {outcome:'insufficient',text:'The evidence service could not provide a validated answer. No automatic retry was made. You can try a new question later.',citations:[]};
    }
    if(input.reconcileOnly && (!result.wire || result.wire==='unknown' || result.wire.state!=='complete'))throw new ChatStoreError('unavailable');
    if(result.outcome.kind==='evidence')return {outcome:'evidence',text:result.outcome.citations.map(c=>`The captured listing states: “${c.quote}” [${c.id}]`).join('\n\n'),citations:result.outcome.citations};
    if(['clarification','conflict','insufficient'].includes(result.outcome.kind)){
      const outcome=result.outcome.kind as 'clarification'|'conflict'|'insufficient';
      return {outcome,text:outcome==='clarification'?'Which exact board model and revision do you mean?':outcome==='conflict'?'The product identities conflict. Please choose one exact model.':'The available approved listing does not establish this. Share the board revision or schematic for wiring questions.',citations:[]};
    }
    throw new ChatStoreError('unavailable');
  };
}
