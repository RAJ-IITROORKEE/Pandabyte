import {strictJson} from '../lightweight/client.ts';
import {agenticManifests} from '../agentic/manifests.ts';
import type {ChatActor} from './chat-contracts.ts';
type Dependencies={authenticate:()=>Promise<ChatActor|null>;current:(actor:ChatActor)=>Promise<boolean>};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
async function input(request:Request){
 if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'')||!request.body)throw 415;
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;
 let rejectAbort:(e:unknown)=>void=()=>{};const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject;});const timer=setTimeout(()=>rejectAbort(408),5000),abort=()=>rejectAbort(400);request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 try{await Promise.race([(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096)throw 413;parts.push(value);}})(),interrupted]);}
 finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* A pending read owns the lock until cancellation settles. */}}
 try{return strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw 400;}
}
export function createAgenticToolsHandler(deps:Dependencies){
 return async(request:Request)=>{
  try{
   if(!['GET','PATCH'].includes(request.method))return json({error:'invalid'},405);
   const actor=await deps.authenticate();if(!actor?.sessionId||request.signal.aborted||!await deps.current(actor))return json({error:'unauthenticated'},401);
   const url=new URL(request.url);if(url.search)return json({error:'invalid'},400);
   let args:Record<string,unknown>={};
   if(request.method==='PATCH'){
    if(request.headers.get('origin')!==url.origin)return json({error:'invalid'},403);
    const v=await input(request);
    if(!object(v)||Object.keys(v).sort().join(',')!=='enabled,expectedVersion,reason,toolId'||!agenticManifests.some(m=>m.id===v.toolId)||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.expectedVersion)||(v.expectedVersion as number)<0||(v.expectedVersion as number)>999999999||typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>300||/\p{Surrogate}/u.test(v.reason))return json({error:'invalid'},400);
    args={p_input:{...v,reason:v.reason.trim()}};
   }
   if(request.signal.aborted||!await deps.current(actor))return json({error:'unauthenticated'},401);
   const {data,error}=await actor.client.database.rpc(request.method==='GET'?'panda_agent_composite_tools_read':'panda_agent_composite_tool_change',args);
   if(error){const detail=(error as {details?:string}).details;return json({error:['forbidden','conflict','invalid','not_found'].includes(detail??'')?detail:'unavailable'},detail==='forbidden'?403:detail==='conflict'?409:detail==='invalid'?400:detail==='not_found'?404:503);}
   if(request.signal.aborted||!await deps.current(actor))return json({error:'unauthenticated'},401);
   if(!object(data)||!Array.isArray(data.tools)||data.tools.length!==4||data.tools.some(t=>!object(t)||!agenticManifests.some(m=>m.id===t.id&&m.hash===t.hash)))return json({error:'unavailable'},503);
   return json(data);
  }catch(e){return json({error:typeof e==='number'&&e<500?'invalid':'unavailable'},typeof e==='number'?e:503);}
 };
}
