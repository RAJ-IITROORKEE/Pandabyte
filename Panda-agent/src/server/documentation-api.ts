import {strictJson} from '../lightweight/client.ts';
import {fetchVendorDocument} from '../diagnostics/vendor-fetch.ts';
import {parseDocumentationDTO} from '../diagnostics/documentation-contracts.ts';
import {ChatStoreError} from './chat-store.ts';
import type {ChatActor} from './chat-contracts.ts';
type Store={documentation:()=>Promise<unknown>;capture:(id:string,doc:{contentHash:string;fragments:string[];fetchedAt:string},rights:string,attribution:string)=>Promise<unknown>;changeVendor:(input:Record<string,unknown>)=>Promise<unknown>;changeTool:(input:Record<string,unknown>)=>Promise<unknown>};
export type DocumentationDependencies={authenticate:()=>Promise<ChatActor|null>;current:(actor:ChatActor)=>Promise<boolean>;canAdmin:(actor:ChatActor)=>Promise<boolean>;store:(actor:ChatActor)=>Store;fetchDocument?:typeof fetchVendorDocument;deadlineMs?:number;bodyDeadlineMs?:number};
const id='espressif-esp-idf-5.5.1-esp32-gpio',quote='#include "driver/gpio.h"';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clean=(v:unknown,n:number):string|null=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n&&!/\p{Surrogate}/u.test(v)?v.trim():null;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const integer=(v:unknown)=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=999_999_999;
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const error=(status:number,code:string)=>json({error:code},status);
async function body(req:Request,deadlineMs:number):Promise<unknown>{
 if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(req.headers.get('content-type')??'')||!req.body)throw 415;
 const reader=req.body.getReader(),parts:Uint8Array[]=[];let size=0;let rejectAbort:(e:unknown)=>void=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject});const timer=setTimeout(()=>rejectAbort(408),deadlineMs);const abort=()=>rejectAbort(503);req.signal.addEventListener('abort',abort,{once:true});if(req.signal.aborted)abort();
 const work=(async()=>{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw 413;parts.push(value);}})();
 try{await Promise.race([work,interrupted]);}finally{clearTimeout(timer);req.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* The pending read still owns the lock. */}}
 try{return strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw 400;}
}
export function createDocumentationHandler(deps:DocumentationDependencies){
 const deadlineMs=deps.deadlineMs??30000,bodyDeadlineMs=deps.bodyDeadlineMs??5000;if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000||!Number.isInteger(bodyDeadlineMs)||bodyDeadlineMs<1||bodyDeadlineMs>5000)throw Error('Invalid documentation deadline');
 const handle=async(request:Request):Promise<Response>=>{
 try{
  if(!['GET','POST','PATCH'].includes(request.method))return error(405,'invalid');
  const checkAbort=()=>{if(request.signal.aborted)throw 503;};checkAbort();
  const actor=await deps.authenticate();checkAbort();if(!actor?.sessionId)return error(401,'unauthenticated');
  const guard=async()=>{checkAbort();const current=await deps.current(actor);checkAbort();if(!current)throw 401;const admin=await deps.canAdmin(actor);checkAbort();if(!admin)throw 403;const stillCurrent=await deps.current(actor);checkAbort();if(!stillCurrent)throw 401;};
  await guard();const url=new URL(request.url);if(url.search)return error(400,'invalid');
  if(request.method!=='GET'&&request.headers.get('origin')!==url.origin)return error(403,'forbidden');
  let v:unknown;if(request.method!=='GET')v=await body(request,bodyDeadlineMs);checkAbort();
  if(request.method==='POST'){
   if(!object(v)||Object.keys(v).sort().join(',')!=='attribution,catalogId,rightsEvidence'||v.catalogId!==id)return error(400,'invalid');
   const rights=clean(v.rightsEvidence,2000),attribution=clean(v.attribution,400);if(!rights||!attribution)return error(400,'invalid');
   await guard();const doc=await (deps.fetchDocument??fetchVendorDocument)(id,{signal:request.signal});checkAbort();
   if(!doc||!Array.isArray(doc.fragments)||!doc.fragments.includes(quote)||typeof doc.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(doc.contentHash)||typeof doc.fetchedAt!=='string'||!Number.isFinite(Date.parse(doc.fetchedAt)))return error(409,'source_changed');
   await guard();await deps.store(actor).capture(id,{contentHash:doc.contentHash,fragments:[quote],fetchedAt:doc.fetchedAt},rights,attribution);
  }else if(request.method==='PATCH'){
   if(!object(v))return error(400,'invalid');let args:Record<string,unknown>;let op:'document'|'tool';
   if(v.target==='document'&&Object.keys(v).sort().join(',')==='action,expectedVersion,reason,rights,rightsEvidence,target,versionId'){
    const reason=clean(v.reason,300),rightsEvidence=clean(v.rightsEvidence,2000);if(!uuid(v.versionId)||!integer(v.expectedVersion)||!['approve','withdraw'].includes(v.action as string)||!['permitted','unknown','denied'].includes(v.rights as string)||!reason||!rightsEvidence)return error(400,'invalid');
    op='document';args={versionId:v.versionId,expectedVersion:v.expectedVersion,action:v.action,rights:v.rights,rightsEvidence,reason};
   }else if(v.target==='tool'&&Object.keys(v).sort().join(',')==='enabled,expectedVersion,reason,target,toolId'){
    const reason=clean(v.reason,300);if(v.toolId!=='search_vendor_docs'||!integer(v.expectedVersion)||typeof v.enabled!=='boolean'||!reason)return error(400,'invalid');op='tool';args={toolId:v.toolId,expectedVersion:v.expectedVersion,enabled:v.enabled,reason};
   }else return error(400,'invalid');
   await guard();const s=deps.store(actor);if(op==='document')await s.changeVendor(args);else await s.changeTool(args);
  }
  await guard();const result=parseDocumentationDTO(await deps.store(actor).documentation());if(!result)throw new Error('invalid projection');await guard();return json(result);
 }catch(e){if(typeof e==='number'&&[400,401,403,408,413,415].includes(e))return error(e,e===401?'unauthenticated':e===403?'forbidden':'invalid');if(e instanceof ChatStoreError){const statuses={unauthenticated:401,not_found:404,conflict:409,quota:429,invalid:400,unavailable:503};return error(statuses[e.code],e.code);}return error(503,'unavailable');}
 };
 return async(request:Request):Promise<Response>=>{const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();let timer:ReturnType<typeof setTimeout>|undefined;
  try{const bounded=new Request(request,{signal:controller.signal});return await Promise.race([handle(bounded),new Promise<Response>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(error(503,'unavailable'));},deadlineMs);})]);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
 };
}
