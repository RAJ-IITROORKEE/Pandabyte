import 'server-only';
import { createHostedRagCompletion } from './hosted-model-openrouter.ts';
import { fastHostedModel, hostedDirectModelIds, hostedModelSelection, requestedHostedModel } from '../hosted-model.ts';
import { createHash } from 'node:crypto';
import {ownHardware, conversationRoute, isUnscopedConversation, isProjectMemoryQuestion } from '../retrieval/conversation-route.ts';
import { readRuntimeCatalog, createInsforgeAdapters } from '../retrieval/insforge-adapters.ts';
import { matchingProducts, resolveMultiProductIdentity } from '../retrieval/multi-product-identity.ts';
import { prepareProductContextSet } from '../retrieval/product-context-set.ts';
import { createSnapshotClient } from '../retrieval/snapshot-client.ts';
import { catalogIntent, catalogTableText, clarificationText, productChoiceText, productQuestion, projectClarificationText, projectIdeasIntent } from '../retrieval/catalog-listing.ts';
import { createBasicRagChatService } from './basic-rag-chat-service.ts';
import { createBasicRagStore } from './basic-rag-store.ts';
import { createLightweightStore } from './lightweight-store.ts';
import { createHostedRagPolicy } from './hosted-rag-policy.ts';
import { createLunaRagCompletion } from './luna-rag-openrouter.ts';
import { ChatStoreError } from './chat-store.ts';
import type { ChatActor, ActivityReporter, ChatAnswer, ChatRead } from './chat-contracts.ts';
import type { BasicRagChatBridge } from './basic-rag-chat-contracts.ts';

type Catalog = Awaited<ReturnType<typeof readRuntimeCatalog>>;
type RetrievalClient = Parameters<typeof readRuntimeCatalog>[0];
const contains = (text:string, value:string) => {
 const needle=value.toLowerCase();let at=text.indexOf(needle);
 while(at>=0){if((at===0||!/[a-z0-9]/.test(text[at-1]))&&(at+needle.length===text.length||!/[a-z0-9]/.test(text[at+needle.length])))return true;at=text.indexOf(needle,at+1);}
 return false;
};
const namedProduct = (question:string,catalog:Catalog) => {
 const text=question.normalize('NFKC').toLowerCase();
 // PandaByte codes (x8266, xC3) name a product on their own; plain chip names that appear in titles (ESP32, WS2812B) only do with a shopping word.
 const shopping=/\b(?:pandabyte|listing|listed|board|module|kit|ring|shield|product|buy|price|stock|sell|order)\b/.test(text)&&!ownHardware(text);
 return catalog.some(row=>contains(text,row.sku)||contains(text,row.title)
  ||(row.title.match(/\b(?:x[a-z0-9]{2,}|[a-z]{2,}[0-9]{2,}[a-z0-9]*(?:-[a-z0-9]+)?)\b/gi)??[]).some(alias=>contains(text,alias)&&(/^x/i.test(alias)||shopping)))
  ||/\bpanda\s*byte\b|\bsku\b|\bx[a-z0-9]{2,}\b/i.test(text);
};

// A bare "it" is a product follow-up only when the question asks about a hardware attribute; "when was it published?" is not.
const factualReference = (text:string) => (/\b(?:this|that) (?:board|product|module|kit)\b/.test(text)
  || (/\b(?:it|its)\b/.test(text)&&/\b(?:usb|connector|port|mcu|cpu|chip|soc|pins?|pinout|gpio|voltage|current|power|battery|flash|memory|ram|psram|specs?|specifications?|wi-?fi|bluetooth|ble|antenna|sensor|led|button|size|dimensions?|weight|price|cost|stock|warranty|compatible|support|temperature|certifi\w*|run|\d+(?:\.\d+)?\s?v)\b/.test(text)))
 && /^(?:what|which|whose|where|when|why|how|does|do|did|is|are|was|were|can|could|will|would|should|has|have)\b/.test(text);
export function isImplicitProductFollowup(question:string,catalog:Catalog):boolean {
 const text=question.normalize('NFKC').toLowerCase();
 return text.length<=240&&text.split(/\s+/).length<=24&&!namedProduct(question,catalog)&&!isProjectMemoryQuestion(question)
  &&factualReference(text);
}

/** Masked, owner-scoped SQL history can carry identity, never the previous answer as evidence. */
export function resolveMainFollowupScope(history:ChatRead,catalog:Catalog,thread:string,ownRequest?:string):{sku:string;anchor:string}|null {
 if(history.thread.id!==thread)return null;
 const latest=history.turns.filter(turn=>turn.requestId!==ownRequest).at(-1);
 if(!latest||latest.status!=='complete'||latest.response?.outcome!=='evidence'||!latest.response.citations.length)return null;
 const owners=latest.response.citations.map(citation=>catalog.filter(row=>row.sourceUrl===citation.sourceUrl&&row.title===citation.title));
 if(owners.some(rows=>rows.length!==1)||new Set(owners.map(rows=>rows[0].sku)).size!==1)return null;
 const plan=resolveMultiProductIdentity(catalog,latest.question);
 if(plan.kind==='planned'?(plan.products.length!==1||plan.products[0].sku!==owners[0][0].sku):!isImplicitProductFollowup(latest.question,catalog))return null;
 return {sku:owners[0][0].sku,anchor:createHash('sha256').update(JSON.stringify([thread,latest])).digest('hex')};
}

/** Catalog-wide questions get a saved, zero-model answer (clarifying options or a catalog table); named products and every other question return null. */
export function catalogListingAnswer(question:string,catalog:Catalog):ChatAnswer|null {
 const named=resolveMultiProductIdentity(catalog,question).kind==='planned';
 if(projectIdeasIntent(question,named))return {outcome:'clarification',text:projectClarificationText(catalog),citations:[]};
 const intent=catalogIntent(question,named);
 return intent?{outcome:'clarification',text:intent.kind==='clarify'?clarificationText(catalog):catalogTableText(catalog,intent.scope),citations:[]}:null;
}

/** For a PandaByte question that resolved to no single product: the closest catalog products as selectable follow-ups (no model call), or null when none match. */
// Only questions about what PandaByte sells or about a product's specifications get choices; a general engineering question that merely
// mentions PandaByte ("how do I write a LoRa gateway script") keeps the general model.
const choiceCue=/\b(?:have|has|sells?|offers?|stock|carry|buy|price|cost|available|which|recommend\w*|specifications?|specs?|pinout|pins?|datasheet|voltage|flash|memory|psram|dimensions?|features?)\b/i;
export function productChoiceAnswer(question:string,catalog:Catalog):ChatAnswer|null {
 const matches=choiceCue.test(question)?matchingProducts(catalog,question):[];
 if(!matches.length)return null;
 // A title that the resolver cannot map back to its own product (it contains another product's code) is offered by SKU instead.
 const own=(row:Catalog[number],q:string)=>{const plan=resolveMultiProductIdentity(catalog,q);return plan.kind==='planned'&&plan.products.length===1&&plan.products[0].sku===row.sku&&!catalogListingAnswer(q,catalog);};
 // The option carries the original question (reduced to the option character set) so the pick answers what was asked, not only an overview;
 // it is used only when it still resolves to exactly this product, so a pick can never return to this clarification.
 // Not carried: a question across products ("which has the most flash") or one whose punctuation carries meaning ("<5V", "don't", "1,000").
 const plain=/^[A-Za-z0-9 .+-]+[?!.]*$/.test(question.trim())&&!/\b(?:which|best|cheapest|most|least|compare|recommend\w*|better)\b/i.test(question);
 const tail=plain?question.trim().replace(/[?!]+$/,'').replace(/\s+/g,' ').trim():'';
 const ask=(row:Catalog[number])=>{
  const base=productQuestion(row);
  if(!own(row,base))return productQuestion(row,true);
  const full=`${base}. ${tail}`;
  return tail.length>=3&&tail.length<=140&&full.length<=220&&own(row,full)?`${full}: ${base.slice(14)}`:base;
 };
 return {outcome:'clarification',text:productChoiceText(matches.map(ask)),citations:[]};
}

/** Catalog aliases select the source path; a product question that resolves to no catalog product falls back to the direct model (owner decision, 12 Nov 2026), whose prompt forbids PandaByte facts. */
export function isMainProductQuestion(question:string,catalog:Catalog):boolean {
 if(isUnscopedConversation(question))return false;
 const text=question.normalize('NFKC').toLowerCase();
 if(namedProduct(question,catalog)||resolveMultiProductIdentity(catalog,question).kind==='planned')return true;
 if(isProjectMemoryQuestion(question))return false;
 if(isImplicitProductFollowup(question,catalog))return true;
 if(factualReference(text))return true;
 if(/\b(?:its|this board|that board|this product|that product)\b/.test(text)&&/\b(?:usb|connector|mcu|cpu|pins?|pinout|voltage|current|flash|memory|psram|specifications?)\b/.test(text))return true;
 if(/\bpanda\s*byte\b|\bsku\b|\bx[a-z0-9]{2,}\b/i.test(text))return true;
 return !['conversation','manufacturer'].includes(conversationRoute(question,catalog).kind);
}

type RouterOptions={direct:BasicRagChatBridge;rag:BasicRagChatBridge;legacy:BasicRagChatBridge;
 route(question:string,signal:AbortSignal,progress?:ActivityReporter,thread?:string):Promise<'rag'|'direct'>;modelAllowed?:()=>boolean};

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
   const selected=await options.route(turn.question,signal,progress,turn.thread);
   const bridge=selected==='rag'?options.rag:options.direct;
   matches.set(JSON.stringify([turn.thread,turn.request]),Promise.resolve(bridge));
   return bridge.start(turn,signal,progress);
  },
 };
}

/** Ranking reads the immutable request snapshot; release checks always read the live client. */
export async function prepareMainRagContext(options:{subject:string;question:string;signal:AbortSignal;
 snapshotClient:RetrievalClient;liveClient:RetrievalClient;authorizeCurrent:()=>Promise<boolean>;adminCurrent:()=>Promise<boolean>;
 retrievalQuestion?:string;historyCurrent?:()=>Promise<boolean>}) {
 const {subject,signal,snapshotClient,liveClient,authorizeCurrent,adminCurrent,historyCurrent}=options;
 const question=options.retrievalQuestion??options.question;
 const prepared=await prepareProductContextSet({actor:{subject},question,client:snapshotClient,signal,
  createAdapters:()=>createInsforgeAdapters(snapshotClient,async()=>({selections:[]})),authorizeCurrent:async()=>!signal.aborted},'at_workflow_release');
 if(prepared.kind!=='ready')return prepared;
 const authorized=async()=>{
  const [active,admin]=await Promise.all([authorizeCurrent(),adminCurrent()]);
  return active&&admin;
 };
 return Object.freeze({...prepared,authorizedBy:authorizeCurrent,revalidate:async()=>{
  if(signal.aborted||!await authorized()||(historyCurrent&&!await historyCurrent()))return false;
  const fresh=await prepareProductContextSet({actor:{subject},question,client:liveClient,signal,authorizeCurrent,
   createAdapters:()=>createInsforgeAdapters(liveClient,async()=>({selections:[]}))},'at_workflow_release');
  return !signal.aborted&&fresh.kind==='ready'&&fresh.digest===prepared.digest&&await authorized()
   &&(!historyCurrent||await historyCurrent());
 }});
}

/** One current source snapshot per request; live source reconstruction still brackets model use and saving. */
export function mainRagChatForActor(options:{actor:ChatActor;request:Request;direct:BasicRagChatBridge;legacy:BasicRagChatBridge;
 current():Promise<boolean>;env?:NodeJS.ProcessEnv}):BasicRagChatBridge {
 const {actor}=options,env=options.env??process.env;
 const selected=hostedModelSelection(env),fast=env.VERCEL==='1'&&selected?.id===fastHostedModel.id;
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
 const historyStore=createLightweightStore(actor,env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'');
 let ownRequest:string|undefined,presetAnswer:ChatAnswer|null=null;
 const rag=createBasicRagChatService({store,current:options.current,enabled:policy.enabled,usagePolicy:'bounded_luna_test',
  prepareContext:async(question,signal,authorizeCurrent)=>{
   const prepared=preparedSnapshot??await prepareMainRagContext({subject:actor.subject,question,signal,snapshotClient:await observation(),liveClient:actor.client,authorizeCurrent,adminCurrent:current});
   if(prepared.kind!=='ready')return prepared;
   return Object.freeze({...prepared,authorizedBy:authorizeCurrent});
  },
  preset:()=>presetAnswer,
  completion:(claim,requestId)=>{
   ownRequest=requestId;
   let claimed=false;
   return (input,beforeSend,signal)=>(fast?createHostedRagCompletion:createLunaRagCompletion)({apiKey:policy.key(),policyCurrent:policy.current,dispatchCurrent:policy.dispatchCurrent,
    preClaimCurrent:policy.dispatchCurrent,receiptPolicy:'hosted',...(fast?{model:requestedHostedModel(options.request.headers.get('X-Panda-Model'))}:{}),claim:async()=>{
     if(claimed||!await claim())return false;claimed=true;
     return policy.claimRequest({request:requestId,surface:'chat',fingerprint:createHash('sha256').update(JSON.stringify(input)).digest('hex')});
    }})(input,beforeSend,signal);
  },
 });
 return createMainRagRouter({direct:options.direct,legacy:options.legacy,rag,
  modelAllowed:()=>!!selected&&(!options.request.headers.has('X-Panda-Model')||(fast?hostedDirectModelIds.includes(options.request.headers.get('X-Panda-Model')!):options.request.headers.get('X-Panda-Model')==='openai/gpt-6-luna')),
  route:async(question,signal,report,thread)=>{
   if(signal.aborted)throw new ChatStoreError('unavailable');
   if(isUnscopedConversation(question))return 'direct';
   const retrievalStarted=performance.now();
   try{report?.('reading_sources');}catch{/* Presentation only. */}
   const client=await observation();
   const catalog=await readRuntimeCatalog(client);
   if(signal.aborted)throw new ChatStoreError('unavailable');
   // Catalog-wide questions get a catalog-only clarification or table (no model call); named products stay on RAG.
   const listing=catalogListingAnswer(question,catalog);
   if(listing){presetAnswer=listing;return 'rag';}
   if(!isMainProductQuestion(question,catalog))return 'direct';
   // Provider workspace/privacy admission follows retrieval, so document timing never includes a model service.
   let retrievalQuestion=question,historyCurrent:(()=>Promise<boolean>)|undefined;
   if(isImplicitProductFollowup(question,catalog)){
    const scope=thread?resolveMainFollowupScope(await historyStore.read(thread),catalog,thread):null;
    if(!scope)return 'direct';
    retrievalQuestion=`${question}\nProduct SKU: ${scope.sku}`;
    historyCurrent=async()=>{try{
     const [history,liveCatalog]=await Promise.all([historyStore.read(thread!),readRuntimeCatalog(actor.client)]);
     const latest=resolveMainFollowupScope(history,liveCatalog,thread!,ownRequest);
     return !!latest&&latest.sku===scope.sku&&latest.anchor===scope.anchor;
    }catch{return false;}};
   }
   preparedSnapshot=await prepareMainRagContext({subject:actor.subject,question,retrievalQuestion,historyCurrent,signal,snapshotClient:client,liveClient:actor.client,
    authorizeCurrent:options.current,adminCurrent:current});
   // No resolvable product: offer the closest catalog products as choices (no model call); with no match, answer from the general model (shown as uncited).
   if(preparedSnapshot.kind==='clarification'){
    preparedSnapshot=undefined;
    presetAnswer=productChoiceAnswer(question,catalog);
    return presetAnswer?'rag':'direct';
   }
   const elapsed=Math.round(performance.now()-retrievalStarted);
   if(preparedSnapshot.kind==='ready'&&Number.isSafeInteger(elapsed)&&elapsed>=0&&elapsed<=120000)try{report?.('reading_sources',{
    fragments:preparedSnapshot.passages.length,characters:preparedSnapshot.passages.reduce((n,p)=>n+p.text.length,0),duplicatesRemoved:0,limitCharacters:20000,retrievalMs:elapsed,
   });}catch{/* Diagnostics cannot authorize an answer. */}
   return 'rag';
  },
 });
}
