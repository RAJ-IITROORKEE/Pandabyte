import { readRuntimeCatalog } from './insforge-adapters.ts';
type CatalogRow = Awaited<ReturnType<typeof readRuntimeCatalog>>[number];
export type PlannedProduct = Readonly<{id:string;sku:string;title:string}>;
const contains=(q:string,raw:string,model=false)=>{const needle=raw.toLowerCase();let at=q.indexOf(needle);while(at>=0){const edge=model?/[a-z0-9-]/:/[a-z0-9]/;if((at===0||!edge.test(q[at-1]))&&(at+needle.length===q.length||!edge.test(q[at+needle.length])))return true;at=q.indexOf(needle,at+1);}return false;};
const genericTitleWords = new Set(['to','of','in','on','or','by','my','a','and','the','with','for','pandabyte','board','module','sensor','development','compatible','kit','pcs','units']);
function titleWords(text: string): string[] {
 return (text.toLowerCase().replace(/\b(\d+)\s+(cm|mm)\b/g,'$1$2').match(/[a-z0-9]+/g) ?? [])
  .filter(word=>word.length>1 && !genericTitleWords.has(word));
}

// Match a corroborated description only when every known title word agrees on exactly one catalog row.
function describedProduct(rows: CatalogRow[], question: string): CatalogRow | undefined {
 const titles=rows.map(row=>new Set(titleWords(row.title)));
 const known=[...new Set(titleWords(question))].filter(word=>titles.some(title=>title.has(word)));
 if(known.length<2 || !known.some(word=>titles.filter(title=>title.has(word)).length===1))return;
 const matching=rows.filter((_row,i)=>known.every(word=>titles[i].has(word)));
 return matching.length===1?matching[0]:undefined;
}
/** Rows must be the full, validated projection, never a filtered catalog. */
export function resolveMultiProductIdentity(rows:CatalogRow[],question:string):{kind:'planned';products:PlannedProduct[]}|{kind:'clarification'} {
 if(typeof question!=='string'||!question.isWellFormed()||!question.trim()||question.length>2000)return {kind:'clarification'};
 // An explicit accessory SKU may be followed by its captured slash-separated board compatibility label.
 const q=question.toLowerCase().replace(/\b([a-z0-9_-]+)\s+\(?([a-z0-9-]+)\s*\/\s*([a-z0-9-]+)\b/g,(full,sku:string,left:string,right:string)=>{
  const exact=rows.find(row=>row.sku.toLowerCase()===sku);
  return exact && left!==right && contains(exact.title.toLowerCase(),left) && contains(exact.title.toLowerCase(),right) ? sku : full;
 });
 const aliases=new Map<string,CatalogRow[]>();
 for(const p of rows)for(const token of new Set(p.title.match(/\b(?:x[a-z0-9]{2,}|[a-z]{2,}[0-9]{2,}[a-z0-9]*(?:-[a-z0-9]+)?)\b/gi)??[])){const key=token.toLowerCase();aliases.set(key,[...(aliases.get(key)??[]),p]);}
 const bases=new Map<string,Set<string>>();for(const [token,owners] of aliases){const base=token.split('-')[0];const set=bases.get(base)??new Set<string>();for(const owner of owners)set.add(owner.id);bases.set(base,set);}
 const named=(text:string)=>rows.filter(p=>contains(text,p.sku)||contains(text,p.title)||[...aliases].some(([token,owners])=>owners.length===1&&owners[0].id===p.id&&contains(text,token,!/^x[a-z0-9]{2,}$/i.test(token))));
 const selected=named(q);
 const productChoice=/\bor\s+[^?!.]{1,100}\b(?:have|has|support|supports|use|uses|contain|contains)\b/i.test(q);
 if(!selected.length && !/\b(?:compare|comparison|versus|vs|between|or|with|and)\b/.test(q)){
  const mentions=q.match(/\b(?:x[a-z0-9]{2,}|[a-z]{2,}[0-9]{2,}[a-z0-9]*(?:-[a-z0-9]+)?)\b/g)??[];
  if(mentions.every(token=>aliases.has(token)||bases.has(token))){
   const row=describedProduct(rows,q);
   if(row)return {kind:'planned',products:[Object.freeze({id:row.id,sku:row.sku,title:row.title})]};
  }
 }
 if(selected.length<1 || selected.length>3 || ((/\b(?:compare|comparison|versus|vs|between)\b/i.test(q) || productChoice) && selected.length<2))return {kind:'clarification'};
 const comparison=/\b(?:compare|comparison|versus|vs|between|or|with)\b/i.test(q);
 if(comparison){
  const mentioned=q.match(/\b(?:x[a-z0-9]{2,}|[a-z]{2,}[0-9]{2,}[a-z0-9]*(?:-[a-z0-9]+)?)\b/gi)??[];
  if(mentioned.some(token=>!aliases.has(token.toLowerCase())&&!bases.has(token.toLowerCase())&&!rows.some(p=>p.sku.toLowerCase()===token.toLowerCase())))return {kind:'clarification'};
 }
 // A shared family is meaningful only when its own comparison segment names one owner.
 const segments=q.split(/\b(?:or|versus|vs|with|and)\b/);
 for(const segment of segments){
  const local=named(segment);
  const shared=[...[...bases].filter(([,owners])=>owners.size>1).map(([token,owners])=>({token,owners})),...[...aliases].filter(([,owners])=>owners.length>1).map(([token,owners])=>({token,owners:new Set(owners.map(p=>p.id))}))];
  for(const {token,owners} of shared)if(contains(segment,token,!/^x[a-z0-9]{2,}$/i.test(token))&&local.filter(p=>owners.has(p.id)).length!==1)return {kind:'clarification'};
 }
 return {kind:'planned',products:selected.map(({id,sku,title})=>Object.freeze({id,sku,title}))};
}
export async function planMultiProductIdentity(client:Parameters<typeof readRuntimeCatalog>[0],question:string){return resolveMultiProductIdentity(await readRuntimeCatalog(client),question);}
