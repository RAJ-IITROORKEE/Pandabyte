import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
import {strictJson} from '../lightweight/client';
import {TOOL_CATALOG,parseToolPatch,parseToolSettings} from '../agent-loop/tool-catalog.ts';
import {cachedTavilyUsage} from '../search/tavily-usage.ts';

// Admin API for the optional-tool switches (migration 20261114100000). GET: catalog merged with settings plus the web-search card data.
// PATCH {name, enabled, expectedVersion}. The database enforces Admin access and versions.
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const errorCodes={forbidden:403,not_found:404,conflict:409,invalid:400,unauthenticated:401} as Record<string,number>;
class Refused extends Error{constructor(readonly status:number,readonly code:string){super(code);}}

async function readBody(request:Request,url:URL):Promise<unknown>{
 if(request.headers.get('origin')!==url.origin)throw new Refused(403,'forbidden');
 if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'')||!request.body)throw new Refused(415,'invalid');
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2048){await reader.cancel();throw new Refused(413,'invalid');}chunks.push(value);}}finally{reader.releaseLock();}
 try{return strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new Refused(400,'invalid');}
}

async function handle(request:Request){
 try{
  if(request.method!=='GET'&&request.method!=='PATCH')return json({error:'invalid'},405);
  const actor=await authenticateLightweight();if(!actor?.sessionId)return json({error:'unauthenticated'},401);
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  const url=new URL(request.url);if(url.search)return json({error:'invalid'},400);
  const rpc=async(fn:string,args:Record<string,unknown>={})=>{
   const {data,error}=await actor.client.database.rpc(fn,args);
   if(error){const d=(error as {details?:string}).details??'';throw new Refused(errorCodes[d]??503,d in errorCodes?d:'unavailable');}
   return data;
  };
  const soft=(e:unknown)=>{if(e instanceof Refused&&e.status!==503)throw e;};
  let result:unknown;
  if(request.method==='GET'){
   // The settings RPC is open to any signed-in user, so prove Admin first with an existing Admin-only RPC.
   await rpc('panda_agent_mcp_servers_admin');
   let settingsAvailable=true,settings=parseToolSettings(null);
   try{settings=parseToolSettings(await rpc('panda_agent_tool_settings'));}catch(e){soft(e);settingsAvailable=false;}
   let month:unknown=null;
   try{month=await rpc('panda_agent_web_search_month');}catch(e){soft(e);}
   const key=process.env.TAVILY_API_KEY?.trim()||'';
   let usage=null,usageError:string|null=null;
   if(key){try{usage=await cachedTavilyUsage(key);}catch{usageError='Tavily usage could not be read right now.';}}
   else usageError='No Tavily key is configured on the server.';
   result={settingsAvailable,tools:TOOL_CATALOG.map(t=>({...t,enabled:t.setting?settings[t.setting].enabled:true,version:t.setting?settings[t.setting].version:null})),
    webSearch:{tavilyConfigured:!!key,usage,usageError,month,dailyCapPerUser:20}};
  }else{
   const p=parseToolPatch(await readBody(request,url));
   if(!p)throw new Refused(400,'invalid');
   result={setting:await rpc('panda_agent_tool_setting_set',{p_name:p.name,p_enabled:p.enabled,p_expected:p.expectedVersion})};
  }
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  return json(result);
 }catch(e){
  if(e instanceof Refused)return json({error:e.code},e.status);
  return json({error:'unavailable'},503);
 }
}
export const agentToolsGET=(request:Request)=>handle(request);
export const agentToolsPATCH=(request:Request)=>handle(request);
