import 'server-only';
import { createHmac } from 'node:crypto';
import { uuid, type ChatActor, type ChatAnswer } from './chat-contracts.ts';
import { ChatStoreError, cleanAnswer, parseChatRead } from './chat-store.ts';

export type DirectBudgetRefs = { budgetId: string; keySha256: string; workspaceSha256: string };
export type DirectState = { question: string; status: 'pending' | 'complete'; claimed: boolean; cancelled: boolean; contextHash: string };
export type DirectUsage = { inputTokens: number; outputTokens: number; costNanoUsd: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createDirectAssistantStore(actor: ChatActor, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ChatStoreError('unavailable');
  async function rpc(op: string, thread: string, request: string, fields: Record<string, unknown> = {}) {
    const payload = JSON.stringify({ v:1, action:'direct_chat', subject:actor.subject, exp:Math.floor(Date.now()/1000)+60, input:{op,thread,request,...fields} });
    const mac = createHmac('sha256', Buffer.from(key,'hex')).update('panda-llm-db-v1\n'+payload).digest('hex');
    try {
      const {data,error} = await actor.client.database.rpc('panda_agent_direct_chat_v2',{p_payload:payload,p_mac:mac});
      if (error) { const e = error as {code?:string;details?:string}; const known = ['not_found','conflict','invalid','unauthenticated','quota'] as const;
        throw new ChatStoreError(e.code === 'P0001' ? known.find(c=>c===e.details) ?? 'unavailable' : 'unavailable'); }
      return data;
    } catch (error) { throw error instanceof ChatStoreError ? error : new ChatStoreError('unavailable'); }
  }
  const flag = (v:unknown, name:'execute'|'recorded') => {
    if (!object(v) || Object.keys(v).join(',')!==name || typeof v[name]!=='boolean') throw new ChatStoreError('unavailable');
    return v[name] as boolean;
  };
  return {
    async ready():Promise<boolean> {
      const {data,error}=await actor.client.database.rpc('panda_agent_direct_ready_v2',{});
      return !error&&object(data)&&Object.keys(data).sort().join(',')==='ready,version'&&data.ready===true&&data.version===2;
    },
    async state(thread:string,request:string):Promise<DirectState|null> {
      const v=await rpc('state',thread,request); if(v===null)return null;
      if(!object(v)||Object.keys(v).sort().join(',')!=='cancelled,claimed,contextHash,question,status'||typeof v.question!=='string'||!v.question.trim()
        ||v.question.length>2000||!v.question.isWellFormed()||!['pending','complete'].includes(v.status as string)
        ||typeof v.contextHash!=='string'||!/^[a-f0-9]{64}$/.test(v.contextHash)||typeof v.claimed!=='boolean'||typeof v.cancelled!=='boolean'||v.cancelled&&v.status!=='complete')throw new ChatStoreError('unavailable');
      return v as DirectState;
    },
    async begin(thread:string,request:string,question:string) { const v=await rpc('begin',thread,request,{question});
      if(!object(v)||typeof v.admitted!=='boolean')throw new ChatStoreError('unavailable');
      if (!v.admitted) return {...parseChatRead(v),admitted:false as const};
      if (!Array.isArray(v.contextRequestIds)||v.contextRequestIds.length>6||v.contextRequestIds.some(id=>typeof id!=='string'||!uuid(id))||new Set(v.contextRequestIds).size!==v.contextRequestIds.length||typeof v.contextHash!=='string'||!/^[a-f0-9]{64}$/.test(v.contextHash)) throw new ChatStoreError('unavailable');
      return {...parseChatRead(v),admitted:true as const,contextRequestIds:v.contextRequestIds as string[],contextHash:v.contextHash}; },
    async claim(thread:string,request:string,refs:DirectBudgetRefs,bodyHash:string) {
      return flag(await rpc('claim',thread,request,{budget:refs.budgetId,keySha256:refs.keySha256,workspaceSha256:refs.workspaceSha256,bodyHash}),'execute');
    },
    async receipt(thread:string,request:string,bodyHash:string,answer:ChatAnswer,usage:DirectUsage) {
      return flag(await rpc('receipt',thread,request,{bodyHash,answer:cleanAnswer(answer),usage}),'recorded');
    },
    async finish(thread:string,request:string,answer:ChatAnswer) { return parseChatRead(await rpc('finish',thread,request,{answer:cleanAnswer(answer)})); },
    async cancel(thread:string,request:string) { return parseChatRead(await rpc('cancel',thread,request)); },
  };
}
