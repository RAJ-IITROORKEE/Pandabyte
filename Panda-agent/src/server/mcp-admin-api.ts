import 'server-only';
import {authenticateLightweight,currentLightweightSession} from './lightweight-connection';
import {strictJson} from '../lightweight/client';
import {createMcpConnection,MCP_SERVER_NAME,MCP_TOOL_NAME,mcpErrorText,publicHttpsUrl,type McpTool} from '../mcp/client.ts';
import {openSecret,sealSecret} from '../mcp/secret.ts';

// Admin API for the MCP registry (migration 20261113190000). The database enforces Admin access, versions and limits;
// this layer authenticates, bounds requests, checks the URL is public https, seals API keys and runs connection tests.
// GET: servers. POST {action:'save', name, url, authHeader, secret, keepSecret, expectedVersion} | {action:'test', name, expectedVersion}.
// PATCH {action:'enable'|'disable'|'remove', name, expectedVersion} | {action:'tool', name, tool, mode:'allow'|'never', expectedVersion}.
export type McpServerView = { name: string; url: string; authHeader: string | null; hasSecret: boolean; tools: McpTool[]; enabled: boolean; version: number;
  lastTestAt: string | null; lastTestOk: boolean | null; lastError: string | null; calls: number; lastCalledAt: string | null; updatedAt: string };
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,list:string)=>Object.keys(v).sort().join(',')===list;
const version=(v:unknown):v is number=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<=1000000000;
const serverName=(v:unknown):v is string=>typeof v==='string'&&v.length<=20&&MCP_SERVER_NAME.test(v);
const errorCodes={forbidden:403,not_found:404,conflict:409,invalid:400,quota:429,unauthenticated:401} as Record<string,number>;
class Refused extends Error{constructor(readonly status:number,readonly code:string,readonly detail?:string){super(code);}}

async function body(request:Request,url:URL):Promise<Record<string,unknown>>{
 if(request.headers.get('origin')!==url.origin)throw new Refused(403,'forbidden');
 if(!/^application\/json(?:\s*;[^;]+)*\s*$/i.test(request.headers.get('content-type')??'')||!request.body)throw new Refused(415,'invalid');
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){await reader.cancel();throw new Refused(413,'invalid','The request is too large.');}chunks.push(value);}}finally{reader.releaseLock();}
 let v:unknown;try{v=strictJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw new Refused(400,'invalid');}
 if(!record(v))throw new Refused(400,'invalid');return v;
}

async function handle(request:Request){
 try{
  if(!['GET','POST','PATCH'].includes(request.method))return json({error:'invalid'},405);
  const actor=await authenticateLightweight();if(!actor?.sessionId)return json({error:'unauthenticated'},401);
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  const url=new URL(request.url);if(url.search)return json({error:'invalid'},400);
  const rpc=async(fn:string,args:Record<string,unknown>={})=>{
   const {data,error}=await actor.client.database.rpc(fn,args);
   if(error){const d=(error as {details?:string}).details??'';throw new Refused(errorCodes[d]??503,d in errorCodes?d:'unavailable');}
   return data;
  };
  let result:unknown;
  if(request.method==='GET')result={servers:await rpc('panda_agent_mcp_servers_admin')};
  else{
   const v=await body(request,url);
   if(!serverName(v.name)||!version(v.expectedVersion))throw new Refused(400,'invalid','Name must be lowercase words joined by hyphens, at most 20 characters.');
   if(request.method==='POST'&&v.action==='save'){
    if(!keys(v,'action,authHeader,expectedVersion,keepSecret,name,secret,url')||typeof v.keepSecret!=='boolean'||(v.expectedVersion===0&&v.keepSecret))throw new Refused(400,'invalid');
    if(!(v.authHeader===null||(typeof v.authHeader==='string'&&/^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(v.authHeader))))throw new Refused(400,'invalid','The header name may use letters, digits and hyphens.');
    if(!(v.secret===null||(typeof v.secret==='string'&&v.secret.length>=1&&v.secret.length<=1000&&!/[\r\n]/.test(v.secret))))throw new Refused(400,'invalid','The API key must be one line, at most 1,000 characters.');
    if(!v.keepSecret&&(v.secret===null)!==(v.authHeader===null))throw new Refused(400,'invalid','Give both a header name and an API key, or neither.');
    const checked=await publicHttpsUrl(v.url);
    if(!checked)throw new Refused(400,'invalid','The URL must be https on the standard port and point to a public address.');
    result={server:await rpc('panda_agent_mcp_server_save',{p_name:v.name,p_url:checked.href,p_auth_header:v.authHeader,p_secret:v.keepSecret||v.secret===null?null:sealSecret(v.name,v.secret as string),p_keep_secret:v.keepSecret,p_expected:v.expectedVersion})};
   }else if(request.method==='POST'&&v.action==='test'){
    if(!keys(v,'action,expectedVersion,name'))throw new Refused(400,'invalid');
    const c=await rpc('panda_agent_mcp_server_connection',{p_name:v.name}) as {url:string;authHeader:string|null;secret:string|null;tools:McpTool[];version:number};
    if(c.version!==v.expectedVersion)throw new Refused(409,'conflict');
    let tools:McpTool[]=Array.isArray(c.tools)?c.tools:[],ok=false,message:string|null=null;
    try{
     const checked=await publicHttpsUrl(c.url);if(!checked)throw new Error('server address is not public https');
     const headers=c.authHeader&&c.secret?{[c.authHeader]:openSecret(v.name,c.secret)}:undefined;
     tools=await createMcpConnection({url:checked,headers,signal:request.signal}).listTools(tools);ok=true;
    }catch(e){message=e instanceof Error&&e.message==='server address is not public https'?e.message:mcpErrorText(e);}
    result={server:await rpc('panda_agent_mcp_server_tools',{p_name:v.name,p_action:'test',p_tools:tools,p_ok:ok,p_error:message,p_expected:v.expectedVersion}),test:{ok,message,tools:tools.length}};
   }else if(request.method==='PATCH'&&['enable','disable','remove'].includes(v.action as string)){
    if(!keys(v,'action,expectedVersion,name'))throw new Refused(400,'invalid');
    result={server:await rpc('panda_agent_mcp_server_set',{p_name:v.name,p_action:v.action,p_expected:v.expectedVersion})};
   }else if(request.method==='PATCH'&&v.action==='tool'){
    if(!keys(v,'action,expectedVersion,mode,name,tool')||typeof v.tool!=='string'||!MCP_TOOL_NAME.test(v.tool)||(v.mode!=='allow'&&v.mode!=='never'))throw new Refused(400,'invalid');
    const c=await rpc('panda_agent_mcp_server_connection',{p_name:v.name}) as {tools:McpTool[];version:number};
    if(c.version!==v.expectedVersion)throw new Refused(409,'conflict');
    if(!Array.isArray(c.tools)||!c.tools.some(t=>t.name===v.tool))throw new Refused(404,'not_found');
    result={server:await rpc('panda_agent_mcp_server_tools',{p_name:v.name,p_action:'tools',p_tools:c.tools.map(t=>t.name===v.tool?{...t,mode:v.mode}:t),p_ok:true,p_error:null,p_expected:v.expectedVersion})};
   }else throw new Refused(400,'invalid');
  }
  if(!await currentLightweightSession(actor.subject,actor.sessionId))return json({error:'unauthenticated'},401);
  return json(result);
 }catch(e){
  if(e instanceof Refused)return json({error:e.code,...(e.detail?{message:e.detail}:{})},e.status);
  if(e instanceof Error&&e.message==='mcp_secret_key_missing')return json({error:'unavailable',message:'The server key for API keys is not configured.'},503);
  return json({error:'unavailable'},503);
 }
}
export const mcpServersGET=(request:Request)=>handle(request);
export const mcpServersPOST=(request:Request)=>handle(request);
export const mcpServersPATCH=(request:Request)=>handle(request);
