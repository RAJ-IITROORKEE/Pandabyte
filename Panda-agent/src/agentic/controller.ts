import {createHash} from 'node:crypto';
import {cleanAnswer} from '../server/chat-store.ts';
import type {ChatAnswer} from '../server/chat-contracts.ts';
import {buildPlan,type Need} from './plan.ts';
import {agenticSkills,type AgenticSkill} from './skills.ts';
import {AgenticBudget} from './budget.ts';
import {convertUnit,formatBom} from './helpers.ts';
import type {ToolActivity} from './contracts.ts';
type Call={id:string;toolId:string;needId:string;inputHash:string};
type Scope={productId:string;sku:string;scopeHash:string};
type VendorBinding={sourceId:string;versionId:string;contentHash:string};
type CanonicalResult={answer:ChatAnswer;scope:Scope|null;vendorBindings:VendorBinding[];contextFragments:number;contextUnits:number};
type ExternalResult={reference:{title:string;url:string;capturedAt:string};toolResultHash:string};
type Grant={id:string;epoch:number;hash:string;enabled:boolean};
type SkillGrant=AgenticSkill&{epoch:number};
export type AgenticDependencies={current:()=>Promise<boolean>;canonical:(need:Need,call:Call,signal:AbortSignal)=>Promise<CanonicalResult>;external:(documentId:string,call:Call,signal:AbortSignal)=>Promise<ExternalResult>;reserve:(call:Call,signal:AbortSignal)=>Promise<'execute'|'recorded'|'unknown'>;record:(call:Call,result:unknown)=>Promise<void>;readRecorded:(call:Call)=>Promise<unknown|null>;grants:()=>Promise<{skill:SkillGrant;tools:Grant[]}>;activity?:(card:ToolActivity)=>void};
export class AgenticOutcomeUnknown extends Error {constructor(){super('Agentic execution outcome unknown');}}
const sha=(v:string)=>createHash('sha256').update(v,'utf8').digest('hex');
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown)=>Number.isSafeInteger(v)&&(v as number)>=0;
function childId(seed:string){const x=sha(seed).slice(0,32).split('');x[12]='5';x[16]='8';const y=x.join('');return `${y.slice(0,8)}-${y.slice(8,12)}-${y.slice(12,16)}-${y.slice(16,20)}-${y.slice(20)}`;}
function externalValue(v:unknown):ExternalResult|null{if(!obj(v)||Object.keys(v).sort().join(',')!=='reference,toolResultHash'||!hex(v.toolResultHash)||!obj(v.reference)||Object.keys(v.reference).sort().join(',')!=='capturedAt,title,url'||v.reference.title!=='GPIO & RTC GPIO'||v.reference.url!=='https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html'||typeof v.reference.capturedAt!=='string'||!Number.isFinite(Date.parse(v.reference.capturedAt)))return null;return v as ExternalResult;}
function canonicalValue(v:unknown,need:Need):CanonicalResult|null{
 if(!obj(v)||Object.keys(v).sort().join(',')!=='answer,contextFragments,contextUnits,scope,vendorBindings'||!integer(v.contextFragments)||!integer(v.contextUnits)||!Array.isArray(v.vendorBindings)||v.vendorBindings.length>1)return null;
 let answer:ChatAnswer;try{answer=cleanAnswer(v.answer);}catch{return null;}
 if(!['evidence','insufficient'].includes(answer.outcome)||answer.citations.some(c=>!answer.text.includes(c.quote))||(answer.outcome==='evidence'&&((v.contextFragments as number)<1||(v.contextUnits as number)<1)))return null;
 const bindings=v.vendorBindings as unknown[];for(const b of bindings)if(!obj(b)||Object.keys(b).sort().join(',')!=='contentHash,sourceId,versionId'||b.sourceId!=='espressif-esp-idf-5.5.1-esp32-gpio'||!uuid(b.versionId)||!hex(b.contentHash))return null;
 if(need.kind==='mcu'){
  if(!obj(v.scope)||Object.keys(v.scope).sort().join(',')!=='productId,scopeHash,sku'||!uuid(v.scope.productId)||v.scope.sku!==need.productSku||!hex(v.scope.scopeHash)||bindings.length||answer.citations.some(c=>'kind' in c)||(answer.outcome==='evidence'&&(answer.citations.length!==1||! /^(?:MCU|Microcontroller):\s*(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/i.test(answer.citations[0].quote))))return null;
 }else if(need.kind==='vendor-gpio'){
  if(v.scope!==null||answer.citations.some(c=>!('kind' in c)||c.kind!=='vendor'||c.quote!=='#include "driver/gpio.h"')||(answer.outcome==='evidence'&&(bindings.length!==1||answer.citations.length!==1))||(answer.outcome!=='evidence'&&bindings.length!==0))return null;
 }else return null;
 return {...v,answer} as CanonicalResult;
}
export async function runAgentic(args:{input:unknown;turnId:string;deadlineAt:number;signal?:AbortSignal},deps:AgenticDependencies){
 const planned=buildPlan(args.input);const empty=(terminalReason:string,planHash:string|null,toolCalls=0,pending=false)=>({answer:{outcome:terminalReason==='clarification'?'clarification' as const:'insufficient' as const,text:terminalReason==='clarification'?'Please clarify the exact products and requested evidence.':'The requested evidence is unavailable or incomplete.',citations:[]},scopes:[] as Scope[],vendorBindings:[] as VendorBinding[],usedGrants:[] as Grant[],terminalReason,toolCalls,modelCalls:0 as const,planHash,toolCards:[] as {toolId:string;state:'complete'}[],pending});
 if(planned.kind!=='planned')return empty(planned.kind,null);const {plan,planHash}=planned;
 if(!uuid(args.turnId)||!Number.isSafeInteger(args.deadlineAt)||args.deadlineAt>Date.now()+30000||args.deadlineAt<=Date.now()||args.signal?.aborted)return empty('unavailable',planHash);
 const budget=new AgenticBudget(args.deadlineAt),controller=new AbortController();let rejectAbort:(error:Error)=>void=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject;});const interruptedAbort=()=>rejectAbort(Error('aborted'));controller.signal.addEventListener('abort',interruptedAbort,{once:true});
 const abort=()=>controller.abort();args.signal?.addEventListener('abort',abort,{once:true});if(args.signal?.aborted)abort();const timer=setTimeout(abort,Math.max(1,args.deadlineAt-Date.now()));
 const live=()=>{if(!budget.live()||controller.signal.aborted)throw Error('unavailable');};
 const bounded=async<T>(work:()=>Promise<T>):Promise<T>=>{live();const v=await Promise.race([work(),interrupted]);live();return v;};
 try{
  const readGrants=async()=>{if(!await bounded(()=>deps.current()))throw Error('unauthorized');const g=await bounded(()=>deps.grants());if(!g||!obj(g.skill)||!Array.isArray(g.tools)||!integer(g.skill.epoch))throw Error('grant');const registered=agenticSkills[plan.input.skillId].find(s=>s.bundleVersion===g.skill.bundleVersion);if(!registered||g.skill.id!==registered.id||g.skill.hash!==registered.hash||g.skill.body!==registered.body||JSON.stringify(g.skill.permissions)!==JSON.stringify(registered.permissions))throw Error('skill');if(g.tools.some(t=>!t||typeof t.id!=='string'||!integer(t.epoch)||!hex(t.hash)||typeof t.enabled!=='boolean')||new Set(g.tools.map(t=>t.id)).size!==g.tools.length)throw Error('grant');return g;};
  const initial=await readGrants(),used=new Map<string,Grant>();
  const authorize=async(toolId:string)=>{const g=await readGrants();if(g.skill.id!==initial.skill.id||g.skill.bundleVersion!==initial.skill.bundleVersion||g.skill.hash!==initial.skill.hash||g.skill.epoch!==initial.skill.epoch||!g.skill.permissions.includes(toolId))throw Error('skill changed');const t=g.tools.find(x=>x.id===toolId),first=initial.tools.find(x=>x.id===toolId);if(!t||!first||!t.enabled||t.epoch!==first.epoch||t.hash!==first.hash)throw Error('tool changed');used.set(toolId,{...t});};
  const scopes:Scope[]=[],vendorBindings:VendorBinding[]=[],citations:ChatAnswer['citations']=[],texts:string[]=[],cards:{toolId:string;state:'complete'}[]=[];let vendorAnswered=false;
  const emit=(card:ToolActivity)=>{try{deps.activity?.(card);}catch{/* Progress observers cannot affect execution. */}};
  for(const need of plan.needs){
   if(need.kind==='external-gpio'&&vendorAnswered)continue;
   await authorize(need.toolId);if(!budget.admit())throw Error('budget');
   const inputHash=sha(JSON.stringify({planHash,need}));const call:Call={id:childId(`${args.turnId}:${planHash}:${need.id}`),toolId:need.toolId,needId:need.id,inputHash};
   let origin:'execution'|'recorded'|'existing'='existing',dispatched=false;
   try{const reserved=await bounded(()=>deps.reserve(call,controller.signal));let raw:unknown;
    if(reserved==='unknown')throw new AgenticOutcomeUnknown();
    if(reserved==='recorded'){origin='recorded';raw=await bounded(()=>deps.readRecorded(call));}
    else if(reserved==='execute'){
     await authorize(need.toolId);
     live();origin='execution';emit({toolId:need.toolId,state:'running',origin});live();dispatched=true;
     if(need.toolId==='panda_scoped_rag')raw=await bounded(()=>deps.canonical(need,call,controller.signal));
     else if(need.toolId==='fetch_public_docs_mcp')raw=await bounded(()=>deps.external(need.documentId!,call,controller.signal));
     else if(need.toolId==='convert_units'){const c=plan.input.conversion;if(!c)throw Error('invalid');const value=convertUnit(c.value,c.from,c.to);if(value===null)throw Error('invalid');raw={value};}
     else {const bom=formatBom(plan.input.components??[]);if(!bom)throw Error('invalid');raw={items:bom};}
     await authorize(need.toolId);
     if(need.toolId==='panda_scoped_rag'&&!canonicalValue(raw,need))throw Error('invalid evidence');
     if(need.toolId==='fetch_public_docs_mcp'&&!externalValue(raw))throw Error('invalid reference');
     try{await bounded(()=>deps.record(call,raw));}catch(e){if(controller.signal.aborted||e instanceof AgenticOutcomeUnknown)throw e;throw new AgenticOutcomeUnknown();}
    }else throw Error('reserve');
    await authorize(need.toolId);
    if(need.toolId==='panda_scoped_rag'){
     const result=canonicalValue(raw,need);if(!result||!budget.addEvidence(result.contextFragments,result.contextUnits,result.answer.citations.length)||result.answer.citations.reduce((n,c)=>n+c.quote.length,0)+citations.reduce((n,c)=>n+c.quote.length,0)>600)throw Error('evidence budget');
     if(result.scope){if(scopes.some(s=>s.productId===result.scope!.productId||s.sku.toLowerCase()===result.scope!.sku.toLowerCase()))throw Error('duplicate identity');scopes.push(result.scope);}vendorBindings.push(...result.vendorBindings);
     if(result.answer.outcome==='evidence'){vendorAnswered=need.kind==='vendor-gpio';for(const c of result.answer.citations){const id=`S${citations.length+1}`;const updated={...c,id};citations.push(updated);texts.push(need.kind==='vendor-gpio'?`For ESP32 and ESP-IDF 5.5.1, the reviewed documentation shows: “${c.quote}” [${id}] This does not establish board applicability or header wiring.`:`The ${need.productSku} listing states: “${c.quote}” [${id}]`);}}
     else if(need.kind==='mcu')throw Error('insufficient');
    }else if(need.toolId==='fetch_public_docs_mcp'){
     const result=externalValue(raw);if(!result)throw Error('invalid reference');texts.push(`Unreviewed external reference: ${result.reference.title} (${result.reference.capturedAt}) ${result.reference.url} — ESP32 and ESP-IDF 5.5.1 only; this does not establish board applicability or header wiring.`);
    }else if(need.toolId==='convert_units'){const c=plan.input.conversion;if(!c||!obj(raw)||Object.keys(raw).join(',')!=='value'||raw.value!==convertUnit(c.value,c.from,c.to))throw Error('invalid conversion');texts.push(`${c.value} ${c.from} = ${raw.value} ${c.to}.`);
    }else {if(!obj(raw)||Object.keys(raw).join(',')!=='items'||!Array.isArray(raw.items)||JSON.stringify(formatBom(raw.items))!==JSON.stringify(formatBom(plan.input.components??[])))throw Error('invalid bom');const escape=(s:string)=>s.replace(/[&<>\[\]()*_`!]/g,c=>`&#${c.charCodeAt(0)};`);texts.push(`Objective: ${escape(plan.input.question)}\n\nUser-reported components: ${raw.items.map((x:{name:string;quantity:number;unit?:string})=>`${escape(x.name)}: ${x.quantity}${x.unit?' '+escape(x.unit):''}`).join('; ')||'none specified'}.\n\nArchitecture: identify input, processing and output stages.\n\nFirmware outline: read inputs, validate observations and update the output. This is conceptual, not tested code.\n\nVerification: record observations for normal and invalid input.\n\nOpen questions: confirm the board revision, components, framework and applicable documentation. Wiring and compatibility are unverified.`);}
    emit({toolId:need.toolId,state:'complete',origin:origin==='execution'?'execution':'recorded'});cards.push({toolId:need.toolId,state:'complete'});
   }catch(e){if(e instanceof AgenticOutcomeUnknown||(dispatched&&controller.signal.aborted))emit({toolId:need.toolId,state:'unknown',origin:dispatched?'execution':'existing'});throw e;}finally{budget.finish();}
  }
  for(const id of used.keys())await authorize(id);if(!await bounded(()=>deps.current()))throw Error('revoked');
  const localOutput=plan.input.task==='unit-conversion'||plan.input.task==='project-outline';return {answer:{outcome:citations.length?'evidence' as const:localOutput?'conversation' as const:'insufficient' as const,text:texts.join('\n\n')||'The requested evidence is unavailable.',citations},scopes,vendorBindings,usedGrants:[...used.values()].sort((a,b)=>a.id.localeCompare(b.id)),terminalReason:citations.length||localOutput?'answered':'insufficient',toolCalls:budget.calls,modelCalls:0 as const,planHash,toolCards:cards,pending:false};
 }catch(e){return empty(budget.live()?'unavailable':'budget_exhausted',planHash,budget.calls,e instanceof AgenticOutcomeUnknown&&budget.live());}finally{clearTimeout(timer);args.signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',interruptedAbort);controller.abort();}
}
