import 'server-only';
import {createHash} from 'node:crypto';
import type {ChatActor} from './chat-contracts.ts';
import {createLunaPrototypePolicy} from './basic-rag-runtime.ts';
import {readLunaPrototypeProfile} from './luna-prototype-profile.ts';
import {createHostedDirectPolicy} from './hosted-direct-policy.ts';
import {createDirectAssistantChat} from './direct-assistant-chat.ts';
import {createDirectAssistantStore,type DirectBudgetRefs} from './direct-assistant-store.ts';
import {createPlainLlmChatService,createPlainLlmStore} from './plain-llm-chat.ts';
import {currentLightweightSession} from './lightweight-connection';
import type {BasicRagChatBridge} from './basic-rag-chat-contracts.ts';
import {mainRagChatForActor} from './main-rag-chat.ts';
import {createHostedDirectCompletion} from './hosted-model-openrouter.ts';
import {fastHostedModel,hostedDirectModelIds,hostedModelSelection,requestedHostedModel} from '../hosted-model.ts';

export function directPolicyForActor(actor:ChatActor,request:Request,env:NodeJS.ProcessEnv=process.env){
 const current=()=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false);
 const requestOrigin=new URL(request.url).origin;
 if(env.VERCEL!==undefined||env.VERCEL_ENV!==undefined)return createHostedDirectPolicy({env,actor,requestOrigin,current});
 let refs:DirectBudgetRefs|null=null;
 const local=createLunaPrototypePolicy({env,actor,subject:actor.subject,requestOrigin,current,profile:async()=>{
  const found=await readLunaPrototypeProfile({env,subject:actor.subject,requestOrigin,nativePreview:true});
  refs=found?{budgetId:found.budgetId,keySha256:createHash('sha256').update(env.OPENROUTER_API_KEY??'').digest('hex'),workspaceSha256:found.workspaceSha256}:null;
  return found;
 }});
 return {...local,enabled:()=>env.PANDA_AGENT_DIRECT_ASSISTANT_ENABLED==='true'?local.enabled():Promise.resolve(false),budgetRefs:()=>local.dispatchCurrent()?refs:null};
}

/** New turns are direct; historical native turns retain status/cancel support without spawning OpenCode. */
export function directAssistantForActor(actor:ChatActor,request:Request):BasicRagChatBridge {
 const key=process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'';
 const current=()=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false);
 const policy=directPolicyForActor(actor,request),requested=request.headers.get('X-Panda-Model');
 const selected=hostedModelSelection(process.env),fast=process.env.VERCEL==='1'&&selected?.id===fastHostedModel.id;
 const direct=createDirectAssistantChat({actor,key,current,budgetRefs:policy.budgetRefs,
  ...(fast?{completion:(o:Parameters<typeof createHostedDirectCompletion>[0])=>createHostedDirectCompletion({...o,model:requestedHostedModel(requested)})}:{}),
  policy:{...policy,enabled:async()=>{
   if(!selected||requested!==null&&(fast?!hostedDirectModelIds.includes(requested):requested!=='openai/gpt-6-luna')||!await policy.enabled())return false;
   return !fast||('isUnmetered' in policy&&typeof policy.isUnmetered==='function'&&policy.isUnmetered()===true);
  }},
  store:createDirectAssistantStore(actor,key)});
 const legacy=createPlainLlmChatService({store:createPlainLlmStore(actor,key),current,enabled:async()=>false,complete:()=>{throw Error('legacy_execution_disabled');}});
 if(process.env.PANDA_AGENT_MAIN_RAG_ENABLED==='true')return mainRagChatForActor({actor,request,direct,legacy,current});
 const service=async(thread:string,id:string)=>await direct.state(thread,id)?direct:await legacy.state(thread,id)?legacy:null;
 return {
  state:async(thread,id)=>!!await service(thread,id),
  status:async(ref,signal)=>(await service(ref.thread,ref.request)??direct).status(ref,signal),
  cancel:async(ref,signal)=>(await service(ref.thread,ref.request)??direct).cancel(ref,signal),
  start:(turn,signal,progress)=>direct.start(turn,signal,progress),
 };
}
