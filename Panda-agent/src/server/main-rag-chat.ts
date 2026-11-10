import 'server-only';
import { createHash } from 'node:crypto';
import { conversationRoute, isUnscopedConversation } from '../retrieval/conversation-route.ts';
import { readRuntimeCatalog, createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import { resolveMultiProductIdentity } from '../retrieval/multi-product-identity.ts';
import { prepareProductContextSet } from '../retrieval/product-context-set.ts';
import { createSnapshotClient } from '../retrieval/snapshot-client.ts';
import { createBasicRagChatService } from './basic-rag-chat-service.ts';
import { createBasicRagStore } from './basic-rag-store.ts';
import { createHostedRagPolicy } from './hosted-rag-policy.ts';
import { createLunaRagCompletion } from './luna-rag-openrouter.ts';
import { ChatStoreError } from './chat-store.ts';
import type { ChatActor, ActivityReporter } from './chat-contracts.ts';
import type { BasicRagChatBridge } from './basic-rag-chat-contracts.ts';

type Catalog = Awaited<ReturnType<typeof readRuntimeCatalog>>;
type RetrievalClient = Parameters<typeof readRuntimeCatalog>[0];
const contains = (text:string, value:string) => {
 const needle=value.toLowerCase();let at=text.indexOf(needle);
 while(at>=0){if((at===0||!/[a-z0-9]/.test(text[at-1]))&&(at+needle.length===text.length||!/[a-z0-9]/.test(text[at+needle.length])))return true;at=text.indexOf(needle,at+1);}
 return false;
};

/** Catalog aliases select the source path; unresolved product requests never become general model facts. */
export function isMainProductQuestion(question:string,catalog:Catalog):boolean {
 if(isUnscopedConversation(question))return false;
 const text=question.normalize('NFKC').toLowerCase();
 if(catalog.some(row=>contains(text,row.sku)||contains(text,row.title)
  ||(row.title.match(/\b(?:x[a-z0-9]{2,}|[a-z]{2,}[0-9]{2,}[a-z0-9]*(?:-[a-z0-9]+)?)\b/gi)??[]).some(alias=>contains(text,alias))))return true;
 if(resolveMultiProductIdentity(catalog,question).kind==='planned')return true;
 if(/\bpanda\s*byte\b|\bsku\b|\bx[a-z0-9]{2,}\b|\b[a-z]{2,}\d{2,}[a-z0-9-]*\b/i.test(text))return true;
 return !['conversation','manufacturer'].includes(conversationRoute(question,catalog).kind);
}

type RouterOptions={direct:BasicRagChatBridge;rag:BasicRagChatBridge;legacy:BasicRagChatBridge;
 route(question:string,signal:AbortSignal,progress?:ActivityReporter):Promise<'rag'|'direct'>;modelAllowed?:()=>boolean};

/** The chosen journal survives changed flags, retries and cancellation; a claimed request is never rerouted. */
export function createMainRagRouter(options:RouterOptions):BasicRagChatBridge {
 const matches=new Map<string,Promise<BasicRagChatBridge|null>>();
 const service=(thread:string,request:string)=>{
  const key=JSON.stringify([thread,request]);
  if(!matches.has(key))matches.set(key,(async()=>{
   const bridges=[options.rag,options.direct,options.legacy];
   const flags=await Promise.all(bridges.map(bridge=>bridge.state(thread,request)));
   if(flags.filter(Boolean).length>1)throw new ChatStoreError('conflict');
   return bridges.find((_bridge,i)=>flags[i])??null;
  })());
  return matches.get(key)!;
 };
 return {
  state:async(thread,request)=>!!await service(thread,request),
  status:async(ref,signal)=>(await service(ref.thread,ref.request)??options.direct).status(ref,signal),
  cancel:async(ref,signal)=>(await service(ref.thread,ref.request)??options.direct).cancel(ref,signal),
  async start(turn,signal,progress){
   const existing=await service(turn.thread,turn.request);
   if(existing)return existing.start(turn,signal,progress);
   if(options.modelAllowed?.()===false)throw new ChatStoreError('unavailable');
   const selected=await options.route(turn.question,signal,progress);
   const bridge=selected==='rag'?options.rag:options.direct;
   matches.set(JSON.stringify([turn.thread,turn.request]),Promise.resolve(bridge));
   return bridge.start(turn,signal,progress);
  },
 };
}

/** Ranking reads the immutable request snapshot; release checks always read the live client. */
export async function prepareMainRagContext(options:{subject:string;question:string;signal:AbortSignal;
 snapshotClient:RetrievalClient;liveClient:RetrievalClient;authorizeCurrent:()=>Promise<boolean>;adminCurrent:()=>Promise<boolean>}) {
 const {subject,question,signal,snapshotClient,liveClient,authorizeCurrent,adminCurrent}=options;
 const prepared=await prepareProductContextSet({actor:{subject},question,client:snapshotClient,signal,
  createAdapters:()=>createInsforgeAdapters(snapshotClient,async()=>({selections:[]})),authorizeCurrent:async()=>!signal.aborted},'at_workflow_release');
 if(prepared.kind!=='ready')return prepared;
 return Object.freeze({...prepared,authorizedBy:authorizeCurrent,revalidate:async()=>{
  if(signal.aborted||!await authorizeCurrent()||!await adminCurrent())return false;
  const fresh=await prepareProductContextSet({actor:{subject},question,client:liveClient,signal,authorizeCurrent,
   createAdapters:()=>createInsforgeAdapters(liveClient,async()=>({selections:[]}))},'at_workflow_release');
  return !signal.aborted&&fresh.kind==='ready'&&fresh.digest===prepared.digest&&await authorizeCurrent()&&await adminCurrent();
 }});
}

/** One current source snapshot per request; live source reconstruction still brackets model use and saving. */
export function mainRagChatForActor(options:{actor:ChatActor;request:Request;direct:BasicRagChatBridge;legacy:BasicRagChatBridge;
 current():Promise<boolean>;env?:NodeJS.ProcessEnv}):BasicRagChatBridge {
 const {actor}=options,env=options.env??process.env;
 const current=async()=>{try{
  const [active,role]=await Promise.all([options.current(),actor.client.database.from('staff_role_memberships').select('role').eq('user_id',actor.subject).limit(1)]);
  return active&&!role.error&&Array.isArray(role.data)&&role.data.length===1&&role.data[0]?.role==='ADMIN';
 }catch{return false;}};
 const policy=createHostedRagPolicy({env,subject:actor.subject,actor,current,requestOrigin:new URL(options.request.url).origin});
 let snapshot:Promise<ReturnType<typeof createSnapshotClient>>|undefined;
 let preparedSnapshot:Awaited<ReturnType<typeof prepareMainRagContext>>|undefined;
 const observation=()=>snapshot??=(async()=>{
  const result=await actor.client.database.rpc('panda_agent_runtime_admin_snapshot');
  if(result.error)throw new ChatStoreError('unavailable');
  const client=createSnapshotClient(result.data);
  if(client.subject!==actor.subject)throw new ChatStoreError('unauthenticated');
  return client;
 })();
 const store=createBasicRagStore(actor,env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'');
 const rag=createBasicRagChatService({store,current:options.current,enabled:policy.enabled,usagePolicy:'bounded_luna_test',
  prepareContext:async(question,signal,authorizeCurrent)=>{
   const prepared=preparedSnapshot??await prepareMainRagContext({subject:actor.subject,question,signal,snapshotClient:await observation(),liveClient:actor.client,authorizeCurrent,adminCurrent:current});
   if(prepared.kind!=='ready')return prepared;
   return Object.freeze({...prepared,authorizedBy:authorizeCurrent});
  },
  completion:(claim,requestId)=>{
   let claimed=false;
   return (input,beforeSend,signal)=>createLunaRagCompletion({apiKey:policy.key(),policyCurrent:policy.current,dispatchCurrent:policy.dispatchCurrent,
    preClaimCurrent:policy.dispatchCurrent,receiptPolicy:'hosted',claim:async()=>{
     if(claimed||!await claim())return false;claimed=true;
     return policy.claimRequest({request:requestId,surface:'chat',fingerprint:createHash('sha256').update(JSON.stringify(input)).digest('hex')});
    }})(input,beforeSend,signal);
  },
 });
 return createMainRagRouter({direct:options.direct,legacy:options.legacy,rag,
  modelAllowed:()=>!options.request.headers.has('X-Panda-Model')||options.request.headers.get('X-Panda-Model')==='openai/gpt-6-luna',
  route:async(question,signal,report)=>{
   if(signal.aborted)throw new ChatStoreError('unavailable');
   if(isUnscopedConversation(question))return 'direct';
   const retrievalStarted=performance.now();
   try{report?.('reading_sources');}catch{/* Presentation only. */}
   const client=await observation();
   const catalog=await readRuntimeCatalog(client);
   if(signal.aborted)throw new ChatStoreError('unavailable');
   if(!isMainProductQuestion(question,catalog))return 'direct';
   // Provider workspace/privacy admission follows retrieval, so document timing never includes a model service.
   preparedSnapshot=await prepareMainRagContext({subject:actor.subject,question,signal,snapshotClient:client,liveClient:actor.client,
    authorizeCurrent:options.current,adminCurrent:current});
   const elapsed=Math.round(performance.now()-retrievalStarted);
   if(preparedSnapshot.kind==='ready'&&Number.isSafeInteger(elapsed)&&elapsed>=0&&elapsed<=120000)try{report?.('reading_sources',{
    fragments:preparedSnapshot.passages.length,characters:preparedSnapshot.passages.reduce((n,p)=>n+p.text.length,0),duplicatesRemoved:0,limitCharacters:20000,retrievalMs:elapsed,
   });}catch{/* Diagnostics cannot authorize an answer. */}
   return 'rag';
  },
 });
}
