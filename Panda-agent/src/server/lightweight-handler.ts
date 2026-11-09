import { conversationRoute, isUnscopedConversation } from '../retrieval/conversation-route.ts';
import { resolveChatScope } from '../retrieval/chat-scope.ts';
import { uuid, type ChatActor, type ChatAnswer, type ChatRead, type ActivityReporter } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import type { createLightweightStore, Execution } from './lightweight-store.ts';
import { strictJson } from '../lightweight/client.ts';
import type { WireResult } from '../lightweight/client.ts';
import {parseGuideInput,guideQuestion} from '../guide/contracts.ts';
import type {createGuideStore,GuideExecution} from './guide-store.ts';
import {GuideDisabledError} from './guide-store.ts';
import type {GuideWire} from '../guide/client.ts';
import {parseDiagnosticInput,diagnosticQuestion} from '../diagnostics/contracts.ts';
import {DiagnosticDisabledError,type createDiagnosticStore} from './diagnostic-store.ts';
import type {createDiagnosticAnswer} from './diagnostic-answer.ts';
import {parseAgenticInput} from '../agentic/contracts.ts';
import {buildPlan} from '../agentic/plan.ts';
import {validAgenticCatalog,type createAgenticAnswer} from './agentic-answer.ts';
import type {createAgenticStore,CompositeExecution} from './agentic-store.ts';
import {parseToolActivity} from '../agentic/tool-activity.ts';
import type {NativeChatBridge} from './native-chat-service.ts';
import type {BasicRagChatBridge} from './basic-rag-chat-contracts.ts';

type Store = ReturnType<typeof createLightweightStore> & {guide?:ReturnType<typeof createGuideStore>;diagnostic?:ReturnType<typeof createDiagnosticStore>;agentic?:ReturnType<typeof createAgenticStore>};
type Dependencies = {
  enabled():boolean;
  authenticate():Promise<ChatActor|null>;
  current(actor:ChatActor):Promise<boolean>;
  store(actor:ChatActor):Store;
  products(actor:ChatActor):Promise<readonly {sku:string;title:string}[]>;
  answer(actor:ChatActor,input:{thread:string;requestId:string;question:string;productSku:string;store:Store;reconcileOnly?:boolean;execution?:Execution},request:Request,progress:ActivityReporter):Promise<ChatAnswer>;
  cancel(actor:ChatActor,turnId:string,execution:Extract<Execution,{prepared:true}>,signal:AbortSignal):Promise<WireResult>;
  guideEnabled?():boolean;
  guideDeadlineMs?:number;
  guideAnswer?(actor:ChatActor,thread:string,requestId:string,execution:GuideExecution,store:ReturnType<typeof createGuideStore>,request:Request,progress:ActivityReporter,reconcile?:boolean):Promise<ChatAnswer & {guideSucceeded?:boolean}>;
  guideCancel?(actor:ChatActor,thread:string,requestId:string,execution:GuideExecution,signal:AbortSignal):Promise<GuideWire>;
  diagnosticEnabled?():boolean;
  diagnosticDeadlineMs?:number;
  diagnosticAnswer?:ReturnType<typeof createDiagnosticAnswer>;
  agenticEnabled?():boolean;
  agenticAnswer?:ReturnType<typeof createAgenticAnswer>;
  agenticCancel?(actor:ChatActor,execution:CompositeExecution,signal:AbortSignal):Promise<void>;
  native?(actor:ChatActor):NativeChatBridge;
  nativeNewMessages?():boolean;
  basicRag?(actor:ChatActor,request:Request):BasicRagChatBridge;
  basicRagNewMessages?():boolean;
};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
const status = (e:unknown) => e instanceof ChatStoreError ? ({not_found:404,conflict:409,invalid:400,unauthenticated:401,quota:429,unavailable:503})[e.code] : typeof e==='number' ? e : 503;
const error = (s:number) => s===401?'unauthenticated':s===404?'not_found':s===409?'conflict':s===429?'quota':s===503?'unavailable':'invalid';
const publicRead = ({thread,messages,projectMemory}:ChatRead) => ({thread,messages,...(projectMemory===undefined?{}:{projectMemory})});
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const text = (v:unknown,max:number):v is string => typeof v==='string' && !!v.trim() && v.length<=max && !/\p{Surrogate}/u.test(v);
async function body(request:Request) {
  if (!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'') || !request.body) throw 415;
  const reader=request.body.getReader(); const parts:Uint8Array[]=[]; let size=0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>8192){await reader.cancel();throw 413;} parts.push(value); }
    try { return strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))); } catch { throw 400; }
  } finally {reader.releaseLock();}
}

const wantsStream = (request:Request) => !!request.headers.get('accept')?.split(',').some(x=>x.trim().split(';')[0]==='text/event-stream');
function streamWork(request:Request, execute:(progress:ActivityReporter,signal:AbortSignal)=>Promise<unknown>):Response {
  let closed=false; const encoder=new TextEncoder(); const seen=new Set<string>(); let contextSent=false;
  const workController=new AbortController();
  const abort=()=>workController.abort(); request.signal.addEventListener('abort',abort,{once:true}); if(request.signal.aborted)abort();
  const stream=new ReadableStream<Uint8Array>({start(controller){
    const send=(value:unknown)=>{if(!closed){try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));}catch{closed=true;workController.abort();}}};
    const progress:ActivityReporter=(stage,context,tool)=>{if(tool){const checked=parseToolActivity(tool);if(!checked)throw new ChatStoreError('unavailable');send({type:'tool',tool:checked});}if(context && !contextSent){contextSent=true;send({type:'context',...context});}if(!seen.has(stage)){seen.add(stage);send({type:'activity',stage});}};
    void execute(progress,workController.signal).then(data=>send({type:'complete',data})).catch(e=>send({type:'error',error:error(status(e))})).finally(()=>{request.signal.removeEventListener('abort',abort);if(!closed){closed=true;controller.close();}});
  },cancel(){closed=true;workController.abort();}});
  return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'private, no-store'}});
}

export function createLightweightHandler(deps:Dependencies) {
  const guideDeadlineMs=deps.guideDeadlineMs??30000;
  if(!Number.isInteger(guideDeadlineMs)||guideDeadlineMs<1||guideDeadlineMs>30000)throw Error('Invalid guide deadline');
  const diagnosticDeadlineMs=deps.diagnosticDeadlineMs??30000;
  if(!Number.isInteger(diagnosticDeadlineMs)||diagnosticDeadlineMs<1||diagnosticDeadlineMs>30000)throw Error('Invalid diagnostic deadline');
  async function handle(request:Request,method:string,action:'list'|'create'|'read'|'message'|'archive'|'delete'|'cancel'|'cleanup',id?:string):Promise<Response> {
    try {
      if (request.method!==method) return new Response(null,{status:405,headers:{allow:method,'cache-control':'private, no-store'}});
      const actor=await deps.authenticate(); if(!actor?.subject || !actor.sessionId)throw new ChatStoreError('unauthenticated');
      if(!deps.enabled())throw new ChatStoreError('unavailable');
      const url=new URL(request.url);
      const readQuery=action==='read' && /^\?requestId=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(url.search);
      if(url.search && !(action==='list' && url.search==='?archived=true') && !readQuery)throw 400;
      const attemptId=readQuery ? readQuery[1] : undefined;
      if(['read','message','archive','delete','cancel','cleanup'].includes(action) && !uuid(id))throw 400;
      if(method!=='GET' && request.headers.get('origin')!==url.origin)throw 403;
      let input:Record<string,unknown>={};
      if(method==='POST' || method==='PATCH') { const v=await body(request); if(!object(v))throw 400; input=v; }
      if(action==='create' && (Object.keys(input).some(k=>k!=='title') || (input.title!==undefined && !text(input.title,100))))throw 400;
      if(action==='archive' && (Object.keys(input).length!==1 || typeof input.archived!=='boolean'))throw 400;
      if(action==='cancel' && (Object.keys(input).some(k=>k!=='requestId') || (input.requestId!==undefined && (!uuid(input.requestId) || input.requestId!==input.requestId.toLowerCase()))))throw 400;
      if(action==='cleanup' && (Object.keys(input).length!==1 || !uuid(input.requestId) || input.requestId!==input.requestId.toLowerCase()))throw 400;
      const guideInput=action==='message'&&Object.hasOwn(input,'guide')?parseGuideInput(input.guide):undefined;
      const diagnosticInput=action==='message'&&Object.hasOwn(input,'diagnostic')?parseDiagnosticInput(input.diagnostic):undefined;
      const agenticInput=action==='message'&&Object.hasOwn(input,'agentic')?parseAgenticInput(input.agentic):undefined;
      if(action==='message' && (agenticInput!==undefined
        ? !agenticInput || buildPlan(agenticInput).kind!=='planned' || Object.keys(input).some(k=>!['requestId','agentic'].includes(k)) || !uuid(input.requestId)
        : diagnosticInput!==undefined
        ? !diagnosticInput || Object.keys(input).some(k=>!['requestId','diagnostic'].includes(k)) || !uuid(input.requestId)
        : guideInput!==undefined
        ? !guideInput || Object.keys(input).some(k=>!['requestId','guide'].includes(k)) || !uuid(input.requestId)
        : Object.keys(input).some(k=>!['requestId','question','webSearch'].includes(k)) || !uuid(input.requestId) || !text(input.question,2000) || (input.webSearch!==undefined && input.webSearch!==false)))throw 400;
      if(method==='DELETE' && request.body) {const reader=request.body.getReader();try{while(true){const p=await reader.read();if(p.done)break;if(p.value.byteLength){await reader.cancel();throw 400;}}}finally{reader.releaseLock();}}
      const store=deps.store(actor);
      const native=deps.native?.(actor);
      const basicRag=deps.basicRag?.(actor,request);
      if(deps.basicRagNewMessages?.() && !basicRag && ['read','message','cancel'].includes(action))throw new ChatStoreError('unavailable');
      if(action==='list')return json(await store.list(url.search==='?archived=true'));
      if(action==='create')return json(await store.create((input.title as string|undefined)?.trim()??'New chat'),201);
      if(action==='archive')return json(await store.archive(id!,input.archived as boolean));
      if(action==='delete') {
        if(native && !await native.cleanupThread(id!,request.signal))throw new ChatStoreError('conflict');
        if(native && !await deps.current(actor))throw new ChatStoreError('unauthenticated');
        return json(await store.delete(id!));
      }
      const safeRead=async () => {
        if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
        const saved=await (native ? native.read(id!) : store.read(id!));
        if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
        return saved;
      };
      const project=(saved:ChatRead) => {
        if(!attemptId)return publicRead(saved);
        const matches=saved.turns.filter(t=>t.requestId===attemptId);
        if(matches.length>1)throw new ChatStoreError('unavailable');
        return {...publicRead(saved),attemptStatus:matches[0]?.status ?? 'absent'};
      };
      const release=async () => project(await safeRead());
      const releaseBasic=async(requestId:string,question?:string) => {
        const saved=await safeRead(), matches=saved.turns.filter(turn=>turn.requestId===requestId);
        if(matches.length!==1 || matches[0].status!=='complete')throw new ChatStoreError('unavailable');
        if(question!==undefined && matches[0].question!==question)throw new ChatStoreError('conflict');
        return project(saved);
      };
      // Only explicit same-origin mutations may remove native context; history GET never deletes it.
      const cleanup=async(requestId:string)=>{try{await native?.cleanup({thread:id!,request:requestId},request.signal);}catch{/* Retain uncertain native context; SQL still forbids deleting its history. */}};
      if(action==='cleanup') {
        if(!native)throw new ChatStoreError('unavailable');
        await safeRead();
        const result=await native.cleanup({thread:id!,request:input.requestId as string},request.signal);
        if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
        if(result.status!=='retired')throw new ChatStoreError('conflict');
        return json({ok:true});
      }
      let agenticObserveOnly=false;
      if(action==='cancel') {
        for(let attempt=0;attempt<2;attempt++) {
          const saved=await safeRead(), pending=saved.turns.filter(t=>t.status==='pending');
          if(pending.length>1)throw new ChatStoreError('unavailable');
          const requested=input.requestId as string|undefined;
          if(requested && pending.length && pending[0].requestId!==requested)throw new ChatStoreError('conflict');
          if(requested && saved.turns.some(t=>t.requestId===requested && t.status==='complete'))return json(publicRead(saved));
          if(!pending.length) {
            if(!requested)return json(publicRead(saved));
            if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
            try {await store.cancel(id!,requested,null);} catch(e) {if(attempt===0 && e instanceof ChatStoreError && e.code==='conflict')continue; throw e;}
            return json(await release());
          }
          const turn=pending[0];
          if(native && await native.state(id!,turn.requestId)) {
            const result=await native.cancel({thread:id!,request:turn.requestId},request.signal);
            if(result.status!=='saved')throw new ChatStoreError('unavailable');
            await cleanup(turn.requestId);
            return json(await release());
          }
          if(basicRag && await basicRag.state(id!,turn.requestId)) {
            if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
            const result=await basicRag.cancel({thread:id!,request:turn.requestId},request.signal);
            if(result.status!=='saved')throw new ChatStoreError('unavailable');
            return json(await releaseBasic(turn.requestId,turn.question));
          }
          if(turn.workflow==='agentic'){
            if(!store.agentic||!deps.agenticCancel)throw new ChatStoreError('unavailable');
            const composite=await store.agentic.execution(id!,turn.requestId);if(!composite)throw new ChatStoreError('unavailable');
            await store.agentic.cancel(id!,turn.requestId,composite.planHash);
            const fenced=await store.agentic.execution(id!,turn.requestId);if(!fenced)throw new ChatStoreError('unavailable');
            await deps.agenticCancel(actor,fenced,request.signal);
            if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
            await store.agentic.finish(id!,turn.requestId,fenced.planHash,{outcome:'insufficient',text:'This request was cancelled. Start a new question when ready.',citations:[]},'cancelled');
            return json(await release());
          }
          const execution=await store.execution(id!,turn.requestId);
          if(execution.prepared) {
            let result:WireResult|GuideWire;
            const guide=await store.guide?.execution(id!,turn.requestId);
            if(guide&&!deps.guideCancel)throw new ChatStoreError('unavailable');
            try { result=guide?await deps.guideCancel!(actor,id!,turn.requestId,guide,request.signal):await deps.cancel(actor,turn.requestId,execution,request.signal); } catch { throw new ChatStoreError('unavailable'); }
            if(result.state!=='rejected' || result.code!=='cancelled')throw new ChatStoreError('unavailable');
          }
          if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
          try { await store.cancel(id!,turn.requestId,execution.prepared?execution.digest:null); }
          catch(e) { if(!execution.prepared && attempt===0 && e instanceof ChatStoreError && e.code==='conflict')continue; throw e; }
          return json(await release());
        }
        throw new ChatStoreError('unavailable');
      }
      const work=async(start:ChatRead,question:string,requestId:string,progress:ActivityReporter,execution?:Execution,workRequest:Request=request) => {
        progress('routing_question');
        if(start.turns.find(t=>t.requestId===requestId)?.workflow==='agentic'){
          if(!store.agentic||!store.diagnostic||!deps.agenticAnswer)throw new ChatStoreError('unavailable');
          const composite=await store.agentic.execution(id!,requestId);if(!composite)throw new ChatStoreError('unavailable');
          const result=deps.agenticEnabled?.()?await deps.agenticAnswer(actor,id!,requestId,composite,store.agentic,store,store.diagnostic,workRequest,progress,action==='read'||agenticObserveOnly):{answer:{outcome:'insufficient' as const,text:'Structured assistance is disabled. Ordinary product chat remains available.',citations:[]},terminalReason:'unavailable',pending:false};
          if(result.pending)throw new ChatStoreError('unavailable');
          if(workRequest.signal.aborted||!await deps.current(actor))throw new ChatStoreError('unauthenticated');
          progress('saving_answer');await store.agentic.finish(id!,requestId,composite.planHash,result.answer,composite.cancelled?'cancelled':result.terminalReason);return release();
        }
        const diagnostic=question.startsWith('Diagnostic (')?await store.diagnostic?.execution(id!,requestId):null;
        if(diagnostic){
          if(!deps.diagnosticAnswer||!store.diagnostic)throw new ChatStoreError('unavailable');
          const controller=new AbortController(),abort=()=>controller.abort();workRequest.signal.addEventListener('abort',abort,{once:true});if(workRequest.signal.aborted)abort();
          const boundedRequest=new Request(workRequest.url,{method:workRequest.method,headers:workRequest.headers,signal:controller.signal});let timer:ReturnType<typeof setTimeout>|undefined;
          const finish=async()=>{
            const result=deps.diagnosticEnabled?.()?await deps.diagnosticAnswer!(actor,id!,requestId,diagnostic,store.diagnostic!,boundedRequest,progress,Boolean(execution)):{answer:{outcome:'insufficient' as const,text:'Diagnostic assistance is disabled. Ordinary product chat remains available.',citations:[]},scopeHash:null,bindings:[]};
            const current=await deps.current(actor);if(controller.signal.aborted||!current)throw new ChatStoreError('unauthenticated');
            progress('saving_answer');await store.diagnostic!.complete(id!,requestId,result.answer,result.scopeHash,result.bindings);return release();
          };
          try{return await Promise.race([finish(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ChatStoreError('unavailable'));},diagnosticDeadlineMs);})]);}
          finally{clearTimeout(timer);workRequest.signal.removeEventListener('abort',abort);}
        }
        const guide=await store.guide?.execution(id!,requestId);
        if(guide){
          if(!deps.guideAnswer || !store.guide)throw new ChatStoreError('unavailable');
          const controller=new AbortController(),abort=()=>controller.abort();workRequest.signal.addEventListener('abort',abort,{once:true});if(workRequest.signal.aborted)abort();
          const boundedRequest=new Request(workRequest.url,{method:workRequest.method,headers:workRequest.headers,signal:controller.signal});
          let timer:ReturnType<typeof setTimeout>|undefined;
          const finish=async()=>{const answer=await deps.guideAnswer!(actor,id!,requestId,guide,store.guide!,boundedRequest,progress,Boolean(execution));
            const current=await deps.current(actor);if(controller.signal.aborted || !current)throw new ChatStoreError('unauthenticated');
            progress('saving_answer');await store.guide!.complete(id!,requestId,answer,answer.guideSucceeded===true);return release();};
          try{return await Promise.race([finish(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ChatStoreError('unavailable'));},guideDeadlineMs);})]);}
          finally{clearTimeout(timer);workRequest.signal.removeEventListener('abort',abort);}
        }
        const catalog=isUnscopedConversation(question)?[]:await deps.products(actor);
        let previous:string|undefined;
        for(const old of start.turns.filter(t=>t.status==='complete').slice(-12)) { const s=resolveChatScope(old.question,catalog,previous); previous=s.kind==='resolved'?s.productSku:undefined; }
        const scope=conversationRoute(question,catalog,previous);
        let answer:ChatAnswer;
        if(scope.kind==='resolved')answer=await deps.answer(actor,{thread:id!,requestId,question,productSku:scope.productSku,store,...(execution?{reconcileOnly:true,execution}:{})},workRequest,progress);
        else if(execution)throw new ChatStoreError('unavailable');
        else if(scope.kind==='conversation' || scope.kind==='manufacturer')answer={outcome:'clarification',text:'This preview answers supported questions from approved PandaByte listings. Include the product model or SKU. General conversational help is not available yet.',citations:[]};
        else answer={outcome:scope.kind,text:scope.text,citations:[]};
        if(workRequest.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
        progress('saving_answer');
        await store.complete(id!,requestId,answer);
        return release();
      };
      if(action==='read') {
        const start=await safeRead(), pending=start.turns.filter(t=>t.status==='pending');
        if(pending.length>1)throw new ChatStoreError('unavailable');
        if(pending.length===1) {
          const turn=pending[0];
          if(native && await native.state(id!,turn.requestId)) {
            try {await native.status({thread:id!,request:turn.requestId,question:turn.question},request.signal);}
            catch(e) {if(!(e instanceof ChatStoreError) || e.code!=='unavailable')throw e;}
            return json(await release());
          }
          if(basicRag && await basicRag.state(id!,turn.requestId)) {
            if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
            try {await basicRag.status({thread:id!,request:turn.requestId},request.signal);}
            catch(e) {if(!(e instanceof ChatStoreError) || e.code!=='unavailable')throw e;}
            return json(await release());
          }
          const execution=await store.execution(id!,turn.requestId);
          const diagnostic=turn.question.startsWith('Diagnostic (')?await store.diagnostic?.execution(id!,turn.requestId):null;
          if(execution.prepared||diagnostic||turn.workflow==='agentic') {
            try { return json(await work(start,turn.question,turn.requestId,()=>{},execution)); }
            catch(e) { if(!(e instanceof ChatStoreError) || e.code!=='unavailable')throw e; return json(await release()); }
          }
        }
        return json(pending.length ? await release() : project(start));
      }
      const question=agenticInput?agenticInput.question:diagnosticInput?diagnosticQuestion(diagnosticInput):guideInput?guideQuestion(guideInput):(input.question as string).trim(), requestId=(input.requestId as string).toLowerCase();
      if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unavailable');
      if(native || basicRag) {
        const before=await safeRead(), existing=before.turns.find(t=>t.requestId===requestId);
        const persisted=native && await native.state(id!,requestId);
        if(persisted && native) {
          if(existing && (existing.question!==question || existing.workflow))throw new ChatStoreError('conflict');
          const result=await native.status({thread:id!,request:requestId,question},request.signal);
          if(result.status!=='saved')throw new ChatStoreError('unavailable');
          await cleanup(requestId);
          return json(await release());
        }
        if(basicRag && await basicRag.state(id!,requestId)) {
          // Admission may have committed after the first read. Re-read before comparing the immutable question.
          const turn=existing ?? (await safeRead()).turns.find(t=>t.requestId===requestId);
          if(!turn)throw new ChatStoreError('unavailable');
          if(turn.question!==question || turn.workflow || guideInput || diagnosticInput || agenticInput)throw new ChatStoreError('conflict');
          if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
          const result=await basicRag.status({thread:id!,request:requestId},request.signal);
          if(result.status!=='saved')throw new ChatStoreError('unavailable');
          return json(await releaseBasic(requestId,question));
        }
        if(basicRag && deps.basicRagNewMessages?.() && !existing && !guideInput && !diagnosticInput && !agenticInput) {
          if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
          const execute=async(progress:ActivityReporter,signal:AbortSignal)=>{
            const result=await basicRag.start({thread:id!,request:requestId,question},signal,stage=>progress(stage));
            if(result.status!=='saved')throw new ChatStoreError('unavailable');
            return releaseBasic(requestId,question);
          };
          if(wantsStream(request))return streamWork(request,execute);
          return json(await execute(()=>{},request.signal));
        }
        if(native && deps.nativeNewMessages?.() && !existing && !guideInput && !diagnosticInput && !agenticInput) {
          const result=await native.start({thread:id!,request:requestId,question},request.signal);
          if(result.status!=='saved')throw new ChatStoreError('unavailable');
          await cleanup(requestId);
          return json(await release());
        }
      }
      if(guideInput&&(!deps.guideEnabled?.()||!store.guide))throw new ChatStoreError('unavailable');
      if(diagnosticInput&&(!deps.diagnosticEnabled?.()||!store.diagnostic))throw new ChatStoreError('unavailable');
      if(agenticInput&&(!deps.agenticEnabled?.()||!store.agentic))throw new ChatStoreError('unavailable');
      if(agenticInput&&!validAgenticCatalog(agenticInput,await deps.products(actor)))throw new ChatStoreError('invalid');
      const start=agenticInput?await store.agentic!.begin(id!,requestId,agenticInput):diagnosticInput?await store.diagnostic!.begin(id!,requestId,diagnosticInput):guideInput?await store.guide!.begin(id!,requestId,guideInput):await store.begin(id!,requestId,question);
      agenticObserveOnly=!!agenticInput&&start.admitted===false;
      const turn=start.turns.find(t=>t.requestId===requestId);
      if(!turn || turn.question!==question)throw new ChatStoreError('unavailable');
      if(turn.status==='complete')return json(await release());
      if(!wantsStream(request))return json(await work(start,question,requestId,()=>{}));
      return streamWork(request,(progress,signal)=>work(start,question,requestId,progress,undefined,new Request(request.url,{method:request.method,headers:request.headers,signal})));
    } catch(e) { if(e instanceof GuideDisabledError)return json({error:'guide_disabled'},409);if(e instanceof DiagnosticDisabledError)return json({error:'diagnostic_disabled'},409);const s=status(e); return json({error:error(s)},s); }
  }
  return {
    listGET:(r:Request)=>handle(r,'GET','list'),createPOST:(r:Request)=>handle(r,'POST','create'),
    readGET:(r:Request,id:string)=>handle(r,'GET','read',id),messagePOST:(r:Request,id:string)=>handle(r,'POST','message',id),
    archivePATCH:(r:Request,id:string)=>handle(r,'PATCH','archive',id),deleteDELETE:(r:Request,id:string)=>handle(r,'DELETE','delete',id),
    cancelPOST:(r:Request,id:string)=>handle(r,'POST','cancel',id),
    cleanupPOST:(r:Request,id:string)=>handle(r,'POST','cleanup',id),
  };
}
