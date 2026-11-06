import {createHash} from 'node:crypto';
import {parseAgenticInput,type AgenticInput} from './contracts.ts';
import {convertUnit} from './helpers.ts';
export type Need={id:string;toolId:'panda_scoped_rag'|'fetch_public_docs_mcp'|'format_bom'|'convert_units';kind:'mcu'|'vendor-gpio'|'external-gpio'|'project-bom'|'unit-conversion';productSku?:string;documentId?:string};
export type AgenticPlan={input:AgenticInput;needs:Need[]};
const token=(q:string,v:string)=>new RegExp(`(?:^|[^a-z0-9_-])${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9_-])`,'i').test(q);
const conflictingProduct=(q:string,products:string[],allowChip=false)=>[...q.matchAll(/\b(?:espx[a-z0-9]+|x[a-z0-9]{2,}|esp(?:8266|32(?:[-_ ]?(?:c\d+|s\d+|h\d+))?))\b/gi)].some(m=>!(allowChip&&m[0].toLowerCase()==='esp32')&&!products.some(p=>p.toLowerCase()===m[0].toLowerCase()));
export function planAgentic(value:unknown):{kind:'planned';plan:AgenticPlan}|{kind:'clarification'|'insufficient'}{
 const input=parseAgenticInput(value);if(!input)return {kind:'clarification'};const q=input.question;
 if(input.task==='unit-conversion'){
  if(input.skillId==='panda-error-triage'||input.products.length!==0||input.frameworkVersion!==null||!input.conversion||convertUnit(input.conversion.value,input.conversion.from,input.conversion.to)===null)return {kind:'clarification'};
  return {kind:'planned',plan:{input,needs:[{id:'unit-conversion',toolId:'convert_units',kind:'unit-conversion'}]}};
 }
 if(/\bor\b/i.test(q)||/\b(?:wir(?:e|ing)|pinout|voltage|compatible|compatibility|safe|schematic|physical revision)\b/i.test(q))return {kind:'clarification'};
 if(input.task==='mcu-comparison'){
  if(input.products.length!==2||!input.products.every(p=>token(q,p))||! /\b(?:mcu|microcontroller)\b/i.test(q)||! /\b(?:and|compare|versus|vs)\b/i.test(q))return {kind:'clarification'};
  if(conflictingProduct(q,input.products))return {kind:'clarification'};
  return {kind:'planned',plan:{input,needs:input.products.map((productSku,i)=>({id:`mcu-${i+1}`,toolId:'panda_scoped_rag',kind:'mcu',productSku}))}};
 }
 if(input.task==='firmware-gpio'){
  if(input.skillId==='panda-project-planner'||input.products.length>1||input.frameworkVersion!=='5.5.1'||! /\bgpio\b/i.test(q)||!token(q,'esp32')||/\besp32[-_ ]?(?:c\d+|s\d+|h\d+)\b|\b(?:arduino|micropython)\b/i.test(q)||/\besp-idf\s*v?(?!5\.5\.1\b)\d+\.\d+(?:\.\d+)?\b/i.test(q))return {kind:'clarification'};
  const named=input.products.filter(p=>p.toLowerCase()!=='esp32');if(conflictingProduct(q,input.products,true)||(named.length&&(!token(q,named[0])||!/\b(?:mcu|microcontroller)\b/i.test(q))))return {kind:'clarification'};
  if(named.length){const parts=q.split(/\band\b/i);if(parts.length!==2||!token(parts[0],named[0])||token(parts[0],'esp32')||! /\b(?:which|what)\s+(?:mcu|microcontroller)\b/i.test(parts[0])||! /\b(?:show|find|reference|documentation)\b/i.test(parts[1])||!token(parts[1],'esp32')||! /\bgpio\b/i.test(parts[1])||token(parts[1],named[0])||/\b(?:its|it|(?:my|the|this|that) board)\b/i.test(parts[1])||/\b(?:can i use|could i use|can we use|could we use)\b|\b(?:supports?|supported|runs?|works?|uses?|used|usable|applies|applicable)\s+(?:on|with|for)\b/i.test(q))return {kind:'clarification'};}
  const documentId='espressif-esp-idf-5.5.1-esp32-gpio';return {kind:'planned',plan:{input,needs:[...(named.length?[{id:'mcu-1',toolId:'panda_scoped_rag' as const,kind:'mcu' as const,productSku:named[0]}]:[]),{id:'vendor-gpio',toolId:'panda_scoped_rag',kind:'vendor-gpio',documentId},{id:'external-gpio',toolId:'fetch_public_docs_mcp',kind:'external-gpio',documentId}]}};
 }
 if(input.skillId!=='panda-project-planner'||input.products.length>1||conflictingProduct(q,input.products)||(input.products.length===1&&!token(q,input.products[0])))return {kind:'clarification'};
 return {kind:'planned',plan:{input,needs:[{id:'project-bom',toolId:'format_bom',kind:'project-bom'}]}};
}
export function buildPlan(value:unknown){const result=planAgentic(value);if(result.kind!=='planned')return result;return {...result,planHash:createHash('sha256').update(JSON.stringify(result.plan),'utf8').digest('hex')};}
