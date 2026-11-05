import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
import {strictJson} from '../lightweight/client';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
async function handle(request:Request){
 try{
  if(!['GET','PATCH'].includes(request.method))return json({error:'invalid'},405);
  const actor=await authenticateLightweight();if(!actor?.sessionId)return json({error:'unauthenticated'},401);
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  const url=new URL(request.url);if(url.search)return json({error:'invalid'},400);
  let args:Record<string,unknown>={};
  if(request.method==='PATCH'){
   if(request.headers.get('origin')!==url.origin)return json({error:'invalid'},403);
   if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'')||!request.body)return json({error:'invalid'},415);
   const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return json({error:'invalid'},413);}chunks.push(value);}}finally{reader.releaseLock();}
   let v:Record<string,unknown>;
   try{v=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as Record<string,unknown>;}
   catch{return json({error:'invalid'},400);}
   if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='action,bundleVersion,expectedVersion,reason,skillId'||!['product-evidence-qa','embedded-project-guide'].includes(v.skillId as string)||!['review','enable','disable','rollback'].includes(v.action as string)||!Number.isSafeInteger(v.bundleVersion)||(v.bundleVersion as number)<1||!Number.isSafeInteger(v.expectedVersion)||(v.expectedVersion as number)<0||typeof v.reason!=='string'||!v.reason.trim()||v.reason.length>300||/\p{Surrogate}/u.test(v.reason))return json({error:'invalid'},400);
   args={p_input:v};
  }
  const {data,error}=await actor.client.database.rpc(request.method==='GET'?'panda_agent_skills_read':'panda_agent_skill_change',args);
  if(error){const details=(error as {details?:string}).details;return json({error:['forbidden','not_found','conflict','invalid'].includes(details??'')?details:'unavailable'},details==='forbidden'?403:details==='not_found'?404:details==='conflict'?409:details==='invalid'?400:503);}
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  return json(data);
 }catch{return json({error:'unavailable'},503);}
}
export const skillsGET=(request:Request)=>handle(request);
export const skillsPATCH=(request:Request)=>handle(request);
