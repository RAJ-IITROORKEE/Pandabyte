import {createHmac} from 'node:crypto';
import {parseDiagnosticInput,type DiagnosticInput} from '../diagnostics/contracts.ts';
import type {VendorSnapshot} from '../diagnostics/vendor-answer.ts';
import {vendorCatalog} from '../diagnostics/vendor-catalog.ts';
import type {ChatActor,ChatAnswer} from './chat-contracts.ts';
import {uuid} from './chat-contracts.ts';
import {ChatStoreError,cleanAnswer,parseChatRead} from './chat-store.ts';
type Binding={sourceId:string;versionId:string;contentHash:string};
export type DiagnosticExecution={input:DiagnosticInput;qaSkillEpoch:number;scopeHash:string|null;bindings:Binding[];toolEpoch:number|null;toolDispatched:boolean;toolResult:Record<string,unknown>|null};
export type DiagnosticAsset={assetId:string;threadId:string;sha256:string;inputSha256:string;bytes:number;width:number;height:number;expiresAt:number;status:'reserved'|'ready'|'unknown'|'deleted'|'expired'};
export type ToolState={id:'search_vendor_docs';enabled:boolean;version:number;hash:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
const fail=():never=>{throw new ChatStoreError('unavailable');};
const bindings=(v:unknown):v is Binding[]=>Array.isArray(v)&&v.length<=1&&v.every(b=>object(b)&&Object.keys(b).sort().join(',')==='contentHash,sourceId,versionId'&&b.sourceId===vendorCatalog.id&&uuid(b.versionId)&&hex(b.contentHash));
export class DiagnosticDisabledError extends ChatStoreError {constructor(){super('conflict');}}
export function createDiagnosticStore(actor:ChatActor,key:string){
 if(!/^[a-f0-9]{64}$/.test(key))return fail();
 async function rpc(name:string,args:Record<string,unknown>={}){
  const {data,error}=await actor.client.database.rpc('panda_agent_'+name,args);
  if(error){const e=error as {code?:string;details?:string};if(e.code==='P0001'&&e.details==='diagnostic_disabled')throw new DiagnosticDisabledError();const known=['not_found','conflict','invalid','unauthenticated','quota'] as const;throw new ChatStoreError(e.code==='P0001'?known.find(k=>k===e.details)??'unavailable':'unavailable');}return data;
 }
 const signed=(action:string,fields:Record<string,unknown>)=>{const p_payload=JSON.stringify({v:1,action,subject:actor.subject,exp:Math.floor(Date.now()/1000)+60,...fields});return {p_payload,p_mac:createHmac('sha256',Buffer.from(key,'hex')).update('panda-diagnostic-db-v1\n'+p_payload).digest('hex')};};
 const asset=(v:unknown):DiagnosticAsset=>{
  if(!object(v)||!uuid(v.assetId)||!uuid(v.threadId)||!hex(v.sha256)||!hex(v.inputSha256)||!integer(v.bytes,1,2097152)||!integer(v.width,1,2048)||!integer(v.height,1,2048)||!integer(v.expiresAt,1)||!['reserved','ready','unknown','deleted','expired'].includes(v.status as string))return fail();
  return {assetId:v.assetId,threadId:v.threadId,sha256:v.sha256,inputSha256:v.inputSha256,bytes:v.bytes,width:v.width,height:v.height,expiresAt:v.expiresAt,status:v.status as DiagnosticAsset['status']};
 };
 return {
  async begin(thread:string,request:string,diagnostic:DiagnosticInput){const v=await rpc('diagnostic_begin',signed('begin',{thread,request,diagnostic}));if(!object(v)||typeof v.admitted!=='boolean')return fail();return {...parseChatRead(v),admitted:v.admitted};},
  async complete(thread:string,request:string,answer:ChatAnswer,scopeHash:string|null,selected:Binding[]){if((scopeHash!==null&&!hex(scopeHash))||!bindings(selected))return fail();return parseChatRead(await rpc('diagnostic_complete',signed('complete',{thread,request,answer:cleanAnswer(answer),scopeHash,bindings:selected})));},
  async execution(thread:string,request:string):Promise<DiagnosticExecution|null>{const v=await rpc('diagnostic_execution',{p_thread:thread,p_request:request});if(v===null)return null;
   if(!object(v)||Object.keys(v).sort().join(',')!=='bindings,input,qaSkillEpoch,scopeHash,toolDispatched,toolEpoch,toolResult')return fail();const input=parseDiagnosticInput(v.input);
   if(!input||!integer(v.qaSkillEpoch)||(v.scopeHash!==null&&!hex(v.scopeHash))||!bindings(v.bindings)||(v.toolEpoch!==null&&!integer(v.toolEpoch))||typeof v.toolDispatched!=='boolean'||(v.toolResult!==null&&!object(v.toolResult)))return fail();
   if((v.toolDispatched&&v.toolEpoch===null)||(!v.toolDispatched&&(v.toolEpoch!==null||v.toolResult!==null)))return fail();return {...v,input} as DiagnosticExecution;
  },
  async scope(input:DiagnosticInput):Promise<VendorSnapshot|null>{const v=await rpc('vendor_scope',{p_chip:input.chip,p_version:input.frameworkVersion});if(v===null)return null;
   if(!object(v)||Object.keys(v).sort().join(',')!=='approved,capturedAt,chip,contentHash,current,fragments,framework,frameworkVersion,rights,scopeHash,sourceId,sourceUrl,title,versionId'||v.sourceId!==vendorCatalog.id||!uuid(v.versionId)||!hex(v.contentHash)||!hex(v.scopeHash)||v.approved!==true||v.current!==true||v.rights!=='permitted'||v.chip!==vendorCatalog.chip||v.framework!==vendorCatalog.framework||v.frameworkVersion!==vendorCatalog.frameworkVersion||v.sourceUrl!==vendorCatalog.sourceUrl||v.title!==vendorCatalog.title||typeof v.capturedAt!=='string'||!Number.isFinite(Date.parse(v.capturedAt))||!Array.isArray(v.fragments)||!v.fragments.length||v.fragments.length>8||v.fragments.some(x=>typeof x!=='string'||!x||x.length>3000)||v.fragments.reduce((n,x)=>n+x.length,0)>20000)return fail();return v as VendorSnapshot;
  },
  async toolState():Promise<ToolState>{const v=await rpc('tool_state');if(!object(v)||Object.keys(v).sort().join(',')!=='enabled,hash,id,version'||v.id!=='search_vendor_docs'||typeof v.enabled!=='boolean'||!integer(v.version)||!hex(v.hash))return fail();return v as ToolState;},
  async claimTool(thread:string,request:string,toolVersion:number){const v=await rpc('diagnostic_toolclaim',signed('toolclaim',{thread,request,toolVersion}));if(!object(v)||typeof v.execute!=='boolean')return fail();return v.execute;},
  async recordTool(thread:string,request:string,toolVersion:number,result:Record<string,unknown>){const v=await rpc('diagnostic_toolrecord',signed('toolrecord',{thread,request,toolVersion,result}));if(!object(v)||v.ok!==true)return fail();},
  async reserveAsset(thread:string,assetId:string,image:{sha256:string;bytes:number;width:number;height:number},inputSha256:string){const v=await rpc('diagnostic_assetreserve',signed('assetreserve',{thread,asset:assetId,...image,inputSha256}));if(!object(v)||typeof v.created!=='boolean')return fail();return {...asset(v),created:v.created};},
  async asset(thread:string,assetId:string){return asset(await rpc('diagnostic_asset_read',{p_thread:thread,p_asset:assetId}));},
  async recordAsset(thread:string,assetId:string,state:DiagnosticAsset['status']){return asset(await rpc('diagnostic_assetrecord',signed('assetrecord',{thread,asset:assetId,state})));},
  async documentation(){return rpc('documentation_read');},
  async capture(catalogId:string,document:{contentHash:string;fragments:string[];fetchedAt:string},rightsEvidence:string,attribution:string){return rpc('vendor_capture',signed('capture',{catalogId,...document,rightsEvidence,attribution}));},
  async changeVendor(input:Record<string,unknown>){return rpc('vendor_change',{p_input:input});},
  async changeTool(input:Record<string,unknown>){return rpc('tool_change',{p_input:input});},
 };
}
