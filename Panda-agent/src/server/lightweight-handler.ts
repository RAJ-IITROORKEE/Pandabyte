import { conversationRoute, isUnscopedConversation } from '../retrieval/conversation-route.ts';
import { resolveChatScope } from '../retrieval/chat-scope.ts';
import { uuid, type ChatActor, type ChatAnswer, type ChatRead, type ActivityReporter } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import type { createLightweightStore, Execution } from './lightweight-store.ts';
import { strictJson } from '../lightweight/client.ts';

type Store = ReturnType<typeof createLightweightStore>;
type Dependencies = {
  enabled():boolean;
  authenticate():Promise<ChatActor|null>;
  current(actor:ChatActor):Promise<boolean>;
  store(actor:ChatActor):Store;
  products(actor:ChatActor):Promise<readonly {sku:string;title:string}[]>;
  answer(actor:ChatActor,input:{thread:string;requestId:string;question:string;productSku:string;store:Store;reconcileOnly?:boolean;execution?:Execution},request:Request,progress:ActivityReporter):Promise<ChatAnswer>;
};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
const status = (e:unknown) => e instanceof ChatStoreError ? ({not_found:404,conflict:409,invalid:400,unauthenticated:401,quota:429,unavailable:503})[e.code] : typeof e==='number' ? e : 503;
const error = (s:number) => s===401?'unauthenticated':s===404?'not_found':s===409?'conflict':s===429?'quota':s===503?'unavailable':'invalid';
const publicRead = ({thread,messages}:ChatRead) => ({thread,messages});
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

export function createLightweightHandler(deps:Dependencies) {
  async function handle(request:Request,method:string,action:'list'|'create'|'read'|'message'|'archive'|'delete',id?:string):Promise<Response> {
    try {
      if (request.method!==method) return new Response(null,{status:405,headers:{allow:method,'cache-control':'private, no-store'}});
      const actor=await deps.authenticate(); if(!actor?.subject || !actor.sessionId)throw new ChatStoreError('unauthenticated');
      if(!deps.enabled())throw new ChatStoreError('unavailable');
      const url=new URL(request.url);
      if(url.search && !(action==='list' && url.search==='?archived=true'))throw 400;
      if(['read','message','archive','delete'].includes(action) && !uuid(id))throw 400;
      if(method!=='GET' && request.headers.get('origin')!==url.origin)throw 403;
      let input:Record<string,unknown>={};
      if(method==='POST' || method==='PATCH') { const v=await body(request); if(!object(v))throw 400; input=v; }
      if(action==='create' && (Object.keys(input).some(k=>k!=='title') || (input.title!==undefined && !text(input.title,100))))throw 400;
      if(action==='archive' && (Object.keys(input).length!==1 || typeof input.archived!=='boolean'))throw 400;
      if(action==='message' && (Object.keys(input).some(k=>!['requestId','question','webSearch'].includes(k)) || !uuid(input.requestId) || !text(input.question,2000) || (input.webSearch!==undefined && input.webSearch!==false)))throw 400;
      if(method==='DELETE' && request.body) {const reader=request.body.getReader();try{while(true){const p=await reader.read();if(p.done)break;if(p.value.byteLength){await reader.cancel();throw 400;}}}finally{reader.releaseLock();}}
      const store=deps.store(actor);
      if(action==='list')return json(await store.list(url.search==='?archived=true'));
      if(action==='create')return json(await store.create((input.title as string|undefined)?.trim()??'New chat'),201);
      if(action==='archive')return json(await store.archive(id!,input.archived as boolean));
      if(action==='delete')return json(await store.delete(id!));
      const safeRead=async () => {
        if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
        const saved=await store.read(id!);
        if(!await deps.current(actor))throw new ChatStoreError('unauthenticated');
        return saved;
      };
      const release=async () => publicRead(await safeRead());
      const work=async(start:ChatRead,question:string,requestId:string,progress:ActivityReporter,execution?:Execution) => {
        progress('routing_question');
        const catalog=isUnscopedConversation(question)?[]:await deps.products(actor);
        let previous:string|undefined;
        for(const old of start.turns.filter(t=>t.status==='complete').slice(-12)) { const s=resolveChatScope(old.question,catalog,previous); previous=s.kind==='resolved'?s.productSku:undefined; }
        const scope=conversationRoute(question,catalog,previous);
        let answer:ChatAnswer;
        if(scope.kind==='resolved')answer=await deps.answer(actor,{thread:id!,requestId,question,productSku:scope.productSku,store,...(execution?{reconcileOnly:true,execution}:{})},request,progress);
        else if(execution)throw new ChatStoreError('unavailable');
        else if(scope.kind==='conversation' || scope.kind==='manufacturer')answer={outcome:'clarification',text:'Ask about a PandaByte product and include its model or SKU. Project guidance and official documentation lookup are not enabled yet.',citations:[]};
        else answer={outcome:scope.kind,text:scope.text,citations:[]};
        if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unauthenticated');
        progress('saving_answer');
        await store.complete(id!,requestId,answer);
        return release();
      };
      if(action==='read') {
        const start=await safeRead(), pending=start.turns.filter(t=>t.status==='pending');
        if(pending.length>1)throw new ChatStoreError('unavailable');
        if(pending.length===1) {
          const turn=pending[0], execution=await store.execution(id!,turn.requestId);
          if(execution.prepared) {
            try { return json(await work(start,turn.question,turn.requestId,()=>{},execution)); }
            catch(e) { if(!(e instanceof ChatStoreError) || e.code!=='unavailable')throw e; return json(await release()); }
          }
        }
        return json(pending.length ? await release() : publicRead(start));
      }
      const question=(input.question as string).trim(), requestId=(input.requestId as string).toLowerCase();
      if(request.signal.aborted || !await deps.current(actor))throw new ChatStoreError('unavailable');
      const start=await store.begin(id!,requestId,question);
      const turn=start.turns.find(t=>t.requestId===requestId);
      if(!turn || turn.question!==question)throw new ChatStoreError('unavailable');
      if(turn.status==='complete')return json(await release());
      if(!request.headers.get('accept')?.split(',').some(x=>x.trim().split(';')[0]==='text/event-stream'))return json(await work(start,question,requestId,()=>{}));
      let closed=false; const encoder=new TextEncoder(); const seen=new Set<string>(); let contextSent=false;
      const stream=new ReadableStream<Uint8Array>({start(controller){
        const send=(value:unknown)=>{if(!closed){try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));}catch{closed=true;}}};
        const progress:ActivityReporter=(stage,context)=>{if(context && !contextSent){contextSent=true;send({type:'context',...context});}if(!seen.has(stage)){seen.add(stage);send({type:'activity',stage});}};
        void work(start,question,requestId,progress).then(data=>send({type:'complete',data})).catch(e=>send({type:'error',error:error(status(e))})).finally(()=>{if(!closed){closed=true;controller.close();}});
      },cancel(){closed=true;}});
      return new Response(stream,{headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'private, no-store'}});
    } catch(e) { const s=status(e); return json({error:error(s)},s); }
  }
  return {
    listGET:(r:Request)=>handle(r,'GET','list'),createPOST:(r:Request)=>handle(r,'POST','create'),
    readGET:(r:Request,id:string)=>handle(r,'GET','read',id),messagePOST:(r:Request,id:string)=>handle(r,'POST','message',id),
    archivePATCH:(r:Request,id:string)=>handle(r,'PATCH','archive',id),deleteDELETE:(r:Request,id:string)=>handle(r,'DELETE','delete',id),
  };
}
