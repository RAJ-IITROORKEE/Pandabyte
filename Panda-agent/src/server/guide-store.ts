import {createHmac} from 'node:crypto';
import {parseGuideInput,type GuideInput,type GuideSkill} from '../guide/contracts.ts';
import type {ChatActor,ChatAnswer} from './chat-contracts.ts';
import {ChatStoreError,cleanAnswer,parseChatRead} from './chat-store.ts';
export type GuideExecution={input:GuideInput;skill:GuideSkill;epoch:number;prepared:boolean;digest:string|null;productId:string|null;productSku:string|null;scopeHash:string|null};
export class GuideDisabledError extends ChatStoreError {constructor(){super('conflict');}}
export function createGuideStore(actor:ChatActor,key:string){
 if(!/^[a-f0-9]{64}$/.test(key))throw new ChatStoreError('unavailable');
 async function rpc(action:string,args:Record<string,unknown>){
  const {data,error}=await actor.client.database.rpc('panda_agent_guide_'+action,args);
  if(error){const e=error as {code?:string;details?:string};if(e.code==='P0001'&&e.details==='guide_disabled')throw new GuideDisabledError();const known=['not_found','conflict','invalid','unauthenticated','quota'] as const;throw new ChatStoreError(e.code==='P0001'?known.find(k=>k===e.details)??'unavailable':'unavailable');}return data;
 }
 function signed(action:string,fields:Record<string,unknown>){const p_payload=JSON.stringify({v:1,action,subject:actor.subject,exp:Math.floor(Date.now()/1000)+60,...fields});return {p_payload,p_mac:createHmac('sha256',Buffer.from(key,'hex')).update('panda-guide-db-v1\n'+p_payload).digest('hex')};}
 return {
  async begin(thread:string,request:string,guide:GuideInput){const v=await rpc('begin',signed('begin',{thread,request,guide})) as {admitted?:unknown};if(typeof v?.admitted!=='boolean')throw new ChatStoreError('unavailable');return {...parseChatRead(v),admitted:v.admitted};},
  async execution(thread:string,request:string):Promise<GuideExecution|null>{
   const v=await rpc('execution',{p_thread:thread,p_request:request}) as Record<string,unknown>|null;if(v===null)return null;
   if(!v||Object.keys(v).sort().join(',')!=='digest,epoch,input,prepared,productId,productSku,scopeHash,skill')throw new ChatStoreError('unavailable');
   const input=parseGuideInput(v.input),skill=v.skill as GuideSkill;
   if(!input||!skill||Object.keys(skill).sort().join(',')!=='hash,id,version'||skill.id!=='embedded-project-guide'||![1,2].includes(skill.version)||!/^[a-f0-9]{64}$/.test(skill.hash)||!Number.isSafeInteger(v.epoch)||typeof v.prepared!=='boolean')throw new ChatStoreError('unavailable');
   if(v.prepared && (typeof v.digest!=='string'||!/^[a-f0-9]{64}$/.test(v.digest)||typeof v.productId!=='string'||typeof v.productSku!=='string'||(v.scopeHash!==null&&(typeof v.scopeHash!=='string'||!/^[a-f0-9]{64}$/.test(v.scopeHash)))))throw new ChatStoreError('unavailable');
   if(!v.prepared && [v.digest,v.productId,v.productSku,v.scopeHash].some(x=>x!==null))throw new ChatStoreError('unavailable');
   return {...v,input,skill} as GuideExecution;
  },
  async prepare(thread:string,request:string,scope:{productId:string;productSku:string;scopeHash:string|null},digest:string){const v=await rpc('prepare',signed('prepare',{thread,request,product:scope.productId,sku:scope.productSku,scopeHash:scope.scopeHash,digest})) as {execute?:unknown};if(typeof v?.execute!=='boolean')throw new ChatStoreError('unavailable');return v.execute;},
  async complete(thread:string,request:string,answer:ChatAnswer,success=false){return parseChatRead(await rpc('complete',signed('complete',{thread,request,answer:cleanAnswer(answer),success})));},
 };
}
