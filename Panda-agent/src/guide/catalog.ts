import {resolveChatScope} from '../retrieval/chat-scope.ts';
import type {createInsforgeAdapters} from '../retrieval/insforge-adapters.ts';
type Client=Parameters<typeof createInsforgeAdapters>[0];
type Item={id:string;sku:string;title:string};
const text=(v:unknown,max:number):v is string=>typeof v==='string' && !!v.trim() && v===v.trim() && v.length<=max && !/\p{Surrogate}/u.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
export async function resolveGuideProduct(client:Client,board:string):Promise<{kind:'resolved';product:{id:string;sku:string}}|{kind:'clarification'|'conflict'}>{
 if(!text(board,128))throw Error('Invalid board');
 const {data,error}=await client.database.rpc('panda_agent_guide_products');
 if(error || !record(data) || Object.keys(data).join(',')!=='items' || !Array.isArray(data.items) || data.items.length>42)throw Error('Catalog unavailable');
 const rows:Item[]=[];
 for(const item of data.items){if(!record(item) || Object.keys(item).sort().join(',')!=='id,sku,title' || !uuid(item.id) || !text(item.sku,128) || !text(item.title,300))throw Error('Invalid catalog');rows.push({id:item.id,sku:item.sku,title:item.title});}
 const unique=(values:string[])=>new Set(values.map(v=>v.normalize('NFKC').toLowerCase())).size===values.length;
 if(!unique(rows.map(r=>r.id)) || !unique(rows.map(r=>r.sku)) || !unique(rows.map(r=>r.title)))throw Error('Invalid catalog');
 const scope=resolveChatScope(board,rows);
 if(scope.kind!=='resolved')return {kind:scope.kind};
 const found=rows.find(r=>r.sku===scope.productSku);
 if(!found)throw Error('Catalog unavailable');
 return {kind:'resolved',product:{id:found.id,sku:found.sku}};
}
