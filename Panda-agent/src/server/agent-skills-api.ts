import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
import {strictJson} from '../lightweight/client';
import {parseSkillMd,SKILL_NAME} from '../agent-loop/skill-md.ts';

// Admin API for the agent skills registry (migration 20261113180000). The database enforces Admin access, limits and versions;
// this layer authenticates, bounds the request and validates SKILL.md before it reaches the database.
// GET: all active skills. POST {name: null | string, content, expectedVersion}: create (name null, version 0) or update.
// PATCH {name, action: enable | disable | remove, expectedVersion}.
export type AgentSkill = { name: string; source: 'built-in' | 'custom'; version: number; description: string; content: string; enabled: boolean; uses: number; lastUsedAt: string | null; updatedAt: string };
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,list:string)=>Object.keys(v).sort().join(',')===list;
const version=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=1000000000;

async function body(request:Request,url:URL):Promise<Record<string,unknown>|Response>{
 if(request.headers.get('origin')!==url.origin)return json({error:'forbidden'},403);
 if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'')||!request.body)return json({error:'invalid'},415);
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384){await reader.cancel();return json({error:'invalid',message:'The request is too large.'},413);}chunks.push(value);}}finally{reader.releaseLock();}
 try{const v=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));return record(v)?v:json({error:'invalid'},400);}catch{return json({error:'invalid'},400);}
}

async function handle(request:Request){
 try{
  if(!['GET','POST','PATCH'].includes(request.method))return json({error:'invalid'},405);
  const actor=await authenticateLightweight();if(!actor?.sessionId)return json({error:'unauthenticated'},401);
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  const url=new URL(request.url);if(url.search)return json({error:'invalid'},400);
  let fn='panda_agent_agent_skills_admin',args:Record<string,unknown>={};
  if(request.method==='POST'){
   const v=await body(request,url);if(v instanceof Response)return v;
   if(!keys(v,'content,expectedVersion,name')||!version(v.expectedVersion)||!(v.name===null||typeof v.name==='string'))return json({error:'invalid'},400);
   const doc=parseSkillMd(v.content);
   if('error' in doc)return json({error:'invalid',message:doc.error},400);
   if(v.name===null?v.expectedVersion!==0:(v.expectedVersion===0||doc.name!==v.name))return json({error:'invalid',message:v.name===null?'A new skill starts at version 0.':'The name in SKILL.md cannot change when editing; create a new skill instead.'},400);
   fn='panda_agent_agent_skill_save';args={p_name:doc.name,p_description:doc.description,p_content:(v.content as string).replace(/\r\n?/g,'\n'),p_expected:v.expectedVersion};
  }else if(request.method==='PATCH'){
   const v=await body(request,url);if(v instanceof Response)return v;
   if(!keys(v,'action,expectedVersion,name')||typeof v.name!=='string'||!SKILL_NAME.test(v.name)||v.name.length>64||!['enable','disable','remove'].includes(v.action as string)||!version(v.expectedVersion))return json({error:'invalid'},400);
   fn='panda_agent_agent_skill_set';args={p_name:v.name,p_action:v.action,p_expected:v.expectedVersion};
  }
  const {data,error}=await actor.client.database.rpc(fn,args);
  if(error){
   const d=(error as {details?:string}).details??'';
   const code=['forbidden','not_found','conflict','invalid','quota','unauthenticated'].includes(d)?d:'unavailable';
   return json({error:code},({forbidden:403,not_found:404,conflict:409,invalid:400,quota:429,unauthenticated:401} as Record<string,number>)[code]??503);
  }
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  return json(request.method==='GET'?{skills:data}:{skill:data});
 }catch{return json({error:'unavailable'},503);}
}
export const agentSkillsGET=(request:Request)=>handle(request);
export const agentSkillsPOST=(request:Request)=>handle(request);
export const agentSkillsPATCH=(request:Request)=>handle(request);
