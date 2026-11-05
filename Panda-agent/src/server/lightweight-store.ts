import { createHmac } from 'node:crypto';
import { ChatStoreError, createChatStore, parseChatRead, cleanAnswer } from './chat-store.ts';
import { uuid, type ChatActor, type ChatAnswer } from './chat-contracts.ts';

export type Execution = {prepared:false;digest:null;sku:null;scopeHash:null;productId:null} | {prepared:true;digest:string;sku:string;scopeHash:string;productId:string};

export function createLightweightStore(actor: ChatActor, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ChatStoreError('unavailable');
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await actor.client.database.rpc(`panda_agent_lightweight_${name}`, args);
    if (error) {
      const e = error as { code?: string; details?: string };
      const known = ['not_found','conflict','invalid','unauthenticated','quota'] as const;
      throw new ChatStoreError(e.code === 'P0001' ? known.find(code => code === e.details) ?? 'unavailable' : 'unavailable');
    }
    return data;
  }
  function signed(action: string, fields: Record<string, unknown>) {
    const p_payload = JSON.stringify({ v:1, action, subject:actor.subject, exp:Math.floor(Date.now()/1000)+60, ...fields });
    return { p_payload, p_mac:createHmac('sha256',Buffer.from(key,'hex')).update(`panda-lightweight-db-v1\n${p_payload}`).digest('hex') };
  }
  return {
    ...createChatStore(actor.client),
    read: async (id: string) => parseChatRead(await rpc('read',{p_thread:id})),
    execution: async (thread:string,request:string):Promise<Execution> => {
      const value=await rpc('execution',{p_thread:thread,p_request:request}) as Record<string,unknown> | null;
      if (!value || typeof value!=='object' || Object.keys(value).sort().join(',')!=='digest,prepared,productId,scopeHash,sku') throw new ChatStoreError('unavailable');
      if (value.prepared===false && value.digest===null && value.sku===null && value.scopeHash===null && value.productId===null) return value as Execution;
      if (value.prepared!==true || typeof value.digest!=='string' || !/^[a-f0-9]{64}$/.test(value.digest) || typeof value.scopeHash!=='string' || !/^[a-f0-9]{64}$/.test(value.scopeHash) || !uuid(value.productId) || typeof value.sku!=='string' || !value.sku.trim() || value.sku.length>128 || /\p{Surrogate}/u.test(value.sku)) throw new ChatStoreError('unavailable');
      return value as Execution;
    },
    begin: async (thread:string,request:string,question:string) => {
      const value = await rpc('begin',signed('begin',{thread,request,question}));
      if (!value || typeof value !== 'object' || typeof (value as {admitted?:unknown}).admitted !== 'boolean') throw new ChatStoreError('unavailable');
      return { ...parseChatRead(value), admitted:(value as {admitted:boolean}).admitted };
    },
    scope: async (product:string) => {
      const value = await rpc('scope',{p_product:product}) as {productId?:unknown;sku?:unknown;scopeHash?:unknown};
      if (!value || value.productId!==product || typeof value.sku!=='string' || typeof value.scopeHash!=='string' || !/^[a-f0-9]{64}$/.test(value.scopeHash)) throw new ChatStoreError('unavailable');
      return {productId:product,sku:value.sku,scopeHash:value.scopeHash};
    },
    prepare: async (thread:string,request:string,question:string,scope:{productId:string;sku:string;scopeHash:string},digest:string) => {
      const value = await rpc('prepare',signed('prepare',{thread,request,question,product:scope.productId,sku:scope.sku,scopeHash:scope.scopeHash,digest})) as {execute?:unknown};
      if (!value || typeof value.execute!=='boolean') throw new ChatStoreError('unavailable');
      return value.execute;
    },
    complete: async (thread:string,request:string,answer:ChatAnswer) => parseChatRead(await rpc('complete',signed('complete',{thread,request,answer:cleanAnswer(answer)}))),
  };
}
