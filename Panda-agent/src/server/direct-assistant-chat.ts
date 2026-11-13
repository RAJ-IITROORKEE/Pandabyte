import 'server-only';
import type { ChatActor } from './chat-contracts.ts';
import { uuid } from './chat-contracts.ts';
import type { BasicRagChatBridge } from './basic-rag-chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import { createDirectAssistantStore, type DirectBudgetRefs, type DirectState } from './direct-assistant-store.ts';
import { directHistory } from './direct-conversation-history.ts';
import { createDirectLunaCompletion, directDiagnostic } from './direct-luna-openrouter.ts';
import { turnUsageFor } from '../hosted-model.ts';

type DirectPolicy = { enabled():Promise<boolean>; current():Promise<boolean>; dispatchCurrent():boolean; key():string; binding():string; isUnmetered?():boolean };
type Options = { actor:ChatActor; key:string; current():Promise<boolean>; policy:DirectPolicy; budgetRefs():DirectBudgetRefs|null;
  store?:ReturnType<typeof createDirectAssistantStore>; completion?:typeof createDirectLunaCompletion; model?:string };

/** No native admission or native receipt is created on this direct route. */
export function createDirectAssistantChat(options:Options):BasicRagChatBridge {
  const store=options.store ?? createDirectAssistantStore(options.actor,options.key), completion=options.completion ?? createDirectLunaCompletion;
  const valid=(thread:string,request:string)=>{if(!uuid(thread)||!uuid(request)||request!==request.toLowerCase())throw new ChatStoreError('invalid');};
  const current=async()=>{if(!await options.current())throw new ChatStoreError('unauthenticated');};
  const read=async(thread:string,request:string)=>{valid(thread,request);const [,state]=await Promise.all([current(),store.state(thread,request)]);await current();return state;};
  const status=(s:DirectState)=>({status:s.status==='complete'?'saved' as const:s.claimed?'unknown' as const:'pending' as const});
  return {
    async state(thread,request){return await read(thread,request)!==null;},
    async status(ref,signal){if(signal.aborted)throw new ChatStoreError('unavailable');const s=await read(ref.thread,ref.request);if(!s)throw new ChatStoreError('not_found');return status(s);},
    async cancel(ref,signal){if(signal.aborted)throw new ChatStoreError('unavailable');const s=await read(ref.thread,ref.request);if(!s)throw new ChatStoreError('not_found');
      if(s.status==='complete')return {status:'saved'}; await store.cancel(ref.thread,ref.request);await current();return {status:'saved'};},
    async start(turn,signal,progress){
      valid(turn.thread,turn.request);
      if(typeof turn.question!=='string'||!turn.question||turn.question!==turn.question.trim()||turn.question.length>2000||!turn.question.isWellFormed())throw new ChatStoreError('invalid');
      const previous=await read(turn.thread,turn.request);
      if(previous){if(previous.question!==turn.question)throw new ChatStoreError('conflict');return status(previous);}
      if(signal.aborted||!await options.policy.enabled())throw new ChatStoreError('unavailable');
      await current();const unmetered=options.policy.isUnmetered?.()===true,refs=unmetered?null:options.budgetRefs();if(!unmetered&&!refs)throw new ChatStoreError('unavailable');
      const begun=await store.begin(turn.thread,turn.request,turn.question);
      if(!begun.admitted){const old=await read(turn.thread,turn.request);return old?status(old):{status:'unknown'};}
      const history=directHistory(begun.turns,turn.request,begun.contextRequestIds);
      let bodyHash:string|undefined,attempted=false;
      const beforeSend=async()=>{if(signal.aborted||!options.policy.dispatchCurrent())return false;
        const s=await read(turn.thread,turn.request);return !!s&&s.status==='pending'&&s.claimed&&!s.cancelled&&s.question===turn.question&&s.contextHash===begun.contextHash&&!signal.aborted&&options.policy.dispatchCurrent();};
      try {
        try{progress?.('routing_question');}catch{/* Presentation only. */}
        const complete=completion({apiKey:options.policy.key(),policyCurrent:options.policy.current,dispatchCurrent:options.policy.dispatchCurrent,
          claim:async hash=>{if(attempted||signal.aborted)return false;attempted=true;await current();bodyHash=hash;return unmetered?store.claimUnmetered(turn.thread,turn.request,hash):store.claim(turn.thread,turn.request,refs!,hash);}});
        const result=await complete({question:turn.question,history},beforeSend,signal);
        if(!bodyHash||!await beforeSend()){directDiagnostic('receipt-gate-denied');return {status:'unknown'};}
        const answer={outcome:'conversation' as const,text:result.answer,citations:[]};
        directDiagnostic('receipt-start');
        const recorded=unmetered?await store.receiptUnmetered(turn.thread,turn.request,bodyHash,answer,result.usage):await store.receipt(turn.thread,turn.request,bodyHash,answer,result.usage);
        if(!recorded){directDiagnostic('receipt-denied');return {status:'unknown'};}
        directDiagnostic('receipt-recorded');
        if(!await beforeSend()){directDiagnostic('finish-gate-denied');return {status:'unknown'};}
        try{progress?.('saving_answer');}catch{/* Presentation only. */}
        await store.finish(turn.thread,turn.request,answer);directDiagnostic('finish-recorded');await current();return {status:'saved',...(options.model?{usage:turnUsageFor(options.model,result.usage)}:{})};
      } catch {directDiagnostic('chat-outcome-unknown');return {status:'unknown'};}
    },
  };
}
