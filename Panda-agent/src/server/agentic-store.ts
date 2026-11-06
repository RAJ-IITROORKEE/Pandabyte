import {createHash,createHmac} from 'node:crypto';
import type {AgenticDependencies} from '../agentic/controller.ts';
import {parseAgenticInput} from '../agentic/contracts.ts';
import {buildPlan} from '../agentic/plan.ts';
import {agenticManifests} from '../agentic/manifests.ts';
import {agenticSkills} from '../agentic/skills.ts';
import type {SkillId} from '../agentic/contracts.ts';
import {uuid,type ChatActor,type ChatAnswer} from './chat-contracts.ts';
import {ChatStoreError,cleanAnswer,parseChatRead} from './chat-store.ts';

const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=():never=>{throw new ChatStoreError('unavailable');};
export function stableJson(v:unknown):string{
 if(v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v)))return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(stableJson).join(',')+']';
 if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableJson(v[k])).join(',')+'}';
 return fail();
}
export const agenticResultHash=(v:unknown)=>createHash('sha256').update(stableJson(v)).digest('hex');
type Call=Parameters<AgenticDependencies['reserve']>[0];
type Scope={productId:string;sku:string;scopeHash:string};
export type CompositeExecution={input:NonNullable<ReturnType<typeof parseAgenticInput>>;planHash:string;deadlineAt:number;cancelled:boolean;terminalReason:string|null;skill:{id:string;bundleVersion:number;hash:string;epoch:number};toolGrants:Array<{id:string;epoch:number;hash:string;enabled:boolean}>;calls:Array<Call&{state:'complete'|'unknown';digest:string|null;scope:Scope|null;result:unknown;resultHash:string|null}>};
const scope=(v:unknown):v is Scope=>object(v)&&Object.keys(v).sort().join(',')==='productId,scopeHash,sku'&&uuid(v.productId)&&typeof v.sku==='string'&&v.sku.length<=128&&hex(v.scopeHash);
export function createAgenticStore(actor:ChatActor,key:string){
 if(!hex(key))return fail();
 const signed=(action:string,fields:Record<string,unknown>)=>{const p_payload=JSON.stringify({v:1,action,subject:actor.subject,exp:Math.floor(Date.now()/1000)+60,...fields});return {p_payload,p_mac:createHmac('sha256',Buffer.from(key,'hex')).update('panda-composite-db-v1\n'+p_payload).digest('hex')};};
 async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await actor.client.database.rpc('panda_agent_composite_'+name,args);if(error){const e=error as {code?:string;details?:string};const codes=['not_found','conflict','invalid','unauthenticated','quota'] as const;throw new ChatStoreError(e.code==='P0001'?codes.find(x=>x===e.details)??'unavailable':'unavailable');}return data;}
 const operation=(action:string,thread:string,request:string,fields:Record<string,unknown>={})=>{if(!uuid(thread)||!uuid(request))return fail();return rpc(action,signed(action,{thread,request,...fields}));};
 return {
  async begin(thread:string,request:string,input:unknown){const planned=buildPlan(input);if(planned.kind!=='planned')throw new ChatStoreError('invalid');const v=await operation('begin',thread,request,{input:planned.plan.input,plan:planned.plan,planHash:planned.planHash});if(!object(v)||typeof v.admitted!=='boolean')return fail();return {...parseChatRead(v),admitted:v.admitted};},
  async execution(thread:string,request:string):Promise<CompositeExecution|null>{
   const v=await operation('execution',thread,request);if(v===null)return null;
   if(!object(v)||!object(v.skill)||!Array.isArray(v.toolGrants)||v.toolGrants.length>4||!Array.isArray(v.calls)||v.calls.length>4||typeof v.cancelled!=='boolean'||!Number.isSafeInteger(v.deadlineAt)||(v.deadlineAt as number)<1||(v.terminalReason!==null&&!['answered','clarification','insufficient','unavailable','budget_exhausted','cancelled'].includes(v.terminalReason as string)))return fail();
   const input=parseAgenticInput(v.input),planned=buildPlan(v.input);if(!input||planned.kind!=='planned'||v.planHash!==planned.planHash||stableJson(v.plan)!==stableJson(planned.plan)||v.skill.id!==input.skillId||![1,2].includes(v.skill.bundleVersion as number)||!hex(v.skill.hash)||!Number.isSafeInteger(v.skill.epoch)||(v.skill.epoch as number)<0)return fail();
   const toolGrants=v.toolGrants;
   if(toolGrants.some(t=>!object(t)||!Number.isSafeInteger(t.epoch)||(t.epoch as number)<0||typeof t.enabled!=='boolean'||!agenticManifests.some(m=>m.id===t.id&&m.hash===t.hash))||new Set(toolGrants.map(t=>t.id)).size!==toolGrants.length||planned.plan.needs.some(n=>!toolGrants.some(t=>t.id===n.toolId)))return fail();
   const calls=v.calls.map(c=>{if(!object(c)||!uuid(c.id)||typeof c.toolId!=='string'||typeof c.needId!=='string'||!hex(c.inputHash)||!['complete','unknown'].includes(c.state as string)||(c.digest!==null&&!hex(c.digest))||(c.scope!==null&&!scope(c.scope))||(c.resultHash!==null&&!hex(c.resultHash))||!planned.plan.needs.some(n=>n.id===c.needId&&n.toolId===c.toolId)||(c.state==='complete'&&(c.result===null||Buffer.byteLength(stableJson(c.result))>24000||c.resultHash!==agenticResultHash(c.result)))||(c.state==='unknown'&&(c.result!==null||c.resultHash!==null)))return fail();return c;});
   if(new Set(calls.map(c=>c.id)).size!==calls.length||new Set(calls.map(c=>c.needId)).size!==calls.length)return fail();
   return {...v,input,calls} as CompositeExecution;
  },
  async grants(skillId:string){const v=await rpc('grants',{p_skill:skillId});if(!object(v)||!object(v.skill)||!Array.isArray(v.tools)||Object.keys(v.skill).sort().join(',')!=='bundleVersion,epoch,hash,id,permissions')return fail();const descriptor=v.skill,bundle=agenticSkills[skillId as SkillId]?.find(b=>b.bundleVersion===descriptor.bundleVersion);if(!bundle||descriptor.id!==skillId||descriptor.hash!==bundle.hash||stableJson(descriptor.permissions)!==stableJson(bundle.permissions)||!Number.isSafeInteger(descriptor.epoch)||(descriptor.epoch as number)<0)return fail();const tools=v.tools.map(t=>{if(!object(t)||!Number.isSafeInteger(t.epoch)||(t.epoch as number)<0||typeof t.enabled!=='boolean'||!agenticManifests.some(m=>m.id===t.id&&m.hash===t.hash))return fail();return {id:t.id as string,epoch:t.epoch as number,hash:t.hash as string,enabled:t.enabled};});return {skill:{...bundle,epoch:descriptor.epoch as number},tools};},
  async reserve(thread:string,request:string,planHash:string,call:Call){const v=await operation('claim',thread,request,{planHash,call});if(!object(v)||!['execute','recorded','unknown'].includes(v.state as string))return fail();return v.state as 'execute'|'recorded'|'unknown';},
  async bind(thread:string,request:string,planHash:string,callId:string,digest:string,binding:Scope|null,context:{fragments:number;units:number}){if(!uuid(callId)||!hex(planHash)||!hex(digest)||(binding!==null&&!scope(binding))||!Number.isSafeInteger(context.fragments)||context.fragments<0||context.fragments>8||!Number.isSafeInteger(context.units)||context.units<0||context.units>20000)return fail();const v=await operation('bind',thread,request,{planHash,callId,digest,scope:binding,contextFragments:context.fragments,contextUnits:context.units});if(!object(v)||v.ok!==true)return fail();},
  async record(thread:string,request:string,planHash:string,callId:string,result:unknown){if(!uuid(callId)||!hex(planHash)||Buffer.byteLength(stableJson(result))>24000)return fail();const v=await operation('record',thread,request,{planHash,callId,result,resultHash:agenticResultHash(result)});if(!object(v)||v.ok!==true)return fail();},
  async finish(thread:string,request:string,planHash:string,answer:ChatAnswer,terminalReason:string){return parseChatRead(await operation('finish',thread,request,{planHash,answer:cleanAnswer(answer),terminalReason}));},
  async cancel(thread:string,request:string,planHash:string){const v=await operation('cancel',thread,request,{planHash});if(!object(v)||v.ok!==true)return fail();},
 };
}
