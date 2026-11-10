import { createHash } from 'node:crypto';
import { playgroundContextProof } from '../control-room/playground-context-proof.ts';
import { prepareQuestionEvidence, parseQuestion } from './answers.ts';
import { planMultiProductIdentity, type PlannedProduct } from './multi-product-identity.ts';
import { readRuntimeCatalog } from './insforge-adapters.ts';
import type { Actor, Adapters, CanonicalChunk } from './contracts.ts';

type Client=Parameters<typeof readRuntimeCatalog>[0];
type Passage=Readonly<{rank:number;productSku:string;productTitle:string;title:string;sourceUrl:string;capturedAt:string;sectionPath:readonly string[];text:string}>;
export async function prepareProductContextSet(input:{actor:Exclude<Actor,null>;question:string;client:Client;createAdapters:()=>Adapters;authorizeCurrent:()=>Promise<boolean>;signal?:AbortSignal}) {
 const {actor,question,client,createAdapters,authorizeCurrent,signal}=input;
 const active=async()=>!signal?.aborted && await authorizeCurrent()===true && !signal?.aborted;
 try {
  if(!actor || !actor.subject || !parseQuestion({question}) || !await active())return {kind:'unavailable' as const};
  const plan=await planMultiProductIdentity(client,question);if(plan.kind!=='planned')return plan;
  const products=plan.products;
  type Captured={product:PlannedProduct;fingerprint:string;chunks:CanonicalChunk[];fragments:Array<{chunk:CanonicalChunk;text:string}>;revalidate:()=>Promise<boolean>};
  const collect=async(product:PlannedProduct):Promise<Captured|null>=>{
   const base=createAdapters();
   const bound:Adapters={...base,ranking:{mode:'lexical'},resolveIdentity:async()=>({kind:'resolved',product:{id:product.id,sku:product.sku}})};
   const evidence=await prepareQuestionEvidence(actor,{question,productSku:product.sku},bound);
   if(evidence.kind==='insufficient'&&!signal?.aborted)return null;
   if(evidence.kind!=='ready'||signal?.aborted)throw Error('Unavailable');
   if(new Set(evidence.chunks.map(c=>c.handle)).size!==evidence.chunks.length)throw Error('Unavailable');
   const map=evidence.byHandle;
   const fragments=evidence.fragments.map(f=>{const c=map.get(f.handle);if(!c||c.productId!==product.id||c.text!==f.text)throw Error('Unavailable');return {chunk:{...c,sectionPath:[...c.sectionPath]},text:f.text};});
   return {product,fingerprint:evidence.fingerprint,chunks:evidence.chunks.map(c=>({...c,sectionPath:[...c.sectionPath]})),fragments,revalidate:evidence.revalidate};
  };
  const collected=await Promise.allSettled(products.map(collect));
  if(collected.some(x=>x.status==='rejected'))return {kind:'unavailable' as const};
  const captured=collected.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[]);
  if(captured.length!==products.length || captured.some(g=>!g.fragments.length) || captured.reduce((n,g)=>n+g.fragments[0].text.length,0)>20000)return {kind:'insufficient' as const};
  const revalidate=async()=>{try{
   if(!await active())return false;
   const [current,scopes]=await Promise.allSettled([
    planMultiProductIdentity(client,question),
    Promise.allSettled(captured.map(group=>group.revalidate())),
   ] as const);
   if(!await active())return false;
   if(current.status!=='fulfilled'||current.value.kind!=='planned'||JSON.stringify(current.value.products)!==JSON.stringify(products))return false;
   return scopes.status==='fulfilled'&&scopes.value.every(result=>result.status==='fulfilled'&&result.value===true);
  }catch{return false;}};
  if(!await revalidate())return {kind:'unavailable' as const};
  const passages:Passage[]=[];let remaining=20000;
  for(let i=0;i<8&&passages.length<8;i++)for(const group of captured){if(passages.length===8)break;const item=group.fragments[i];if(!item||item.text.length>remaining)continue;remaining-=item.text.length;passages.push(Object.freeze({rank:passages.length+1,productSku:group.product.sku,productTitle:group.product.title,title:item.chunk.title,sourceUrl:item.chunk.sourceUrl,capturedAt:item.chunk.capturedAt,sectionPath:Object.freeze([...item.chunk.sectionPath]),text:item.text}));}
  if(!passages.length)return {kind:'insufficient' as const};
  Object.freeze(passages);const sourceProofs=Object.freeze(captured.map(g=>Object.freeze({productSku:g.product.sku,fingerprint:g.fingerprint})));const digest=createHash('sha256').update(JSON.stringify([1,question,products,passages,sourceProofs])).digest('hex');
  const group=captured[0];const legacyBinding=products.length===1?Object.freeze({textDigest:createHash('sha256').update(JSON.stringify(passages.map(({rank,text})=>({rank,text})))).digest('hex'),provenanceDigest:playgroundContextProof({id:group.product.id,sku:group.product.sku},group.fingerprint,group.fragments.map(({chunk,text})=>({handle:chunk.handle,text})),group.chunks)}):undefined;
  // revalidate brackets fresh catalog and scope reads with this exact authorization callback.
  return Object.freeze({kind:'ready' as const,products:Object.freeze([...products]),passages,sourceProofs,digest,...(legacyBinding?{legacyBinding}:{}),authorizedBy:authorizeCurrent,revalidate});
 }catch{return {kind:'unavailable' as const};}
}

export type ReadyProductContext = Extract<Awaited<ReturnType<typeof prepareProductContextSet>>, {kind:'ready'}>;
