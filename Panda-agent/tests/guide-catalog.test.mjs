import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGuideProduct} from '../src/guide/catalog.ts';
const items=[{id:'11111111-1111-4111-8111-111111111111',sku:'BOARD-A',title:'Example Board A'},{id:'22222222-2222-4222-8222-222222222222',sku:'BOARD-B',title:'Example Board B'}];
const client=value=>({database:{rpc:async name=>{assert.equal(name,'panda_agent_guide_products');return value;}}});
test('published catalog resolves one board and refuses ambiguous and conflicting identities',async()=>{
 const c=client({data:{items},error:null});
 assert.deepEqual(await resolveGuideProduct(c,'BOARD-A'),{kind:'resolved',product:{id:items[0].id,sku:'BOARD-A'}});
 assert.equal((await resolveGuideProduct(c,'BOARD-A or BOARD-B')).kind,'conflict');
 assert.equal((await resolveGuideProduct(c,'unknown board')).kind,'clarification');
});
test('catalog fails closed on untrusted data or RPC errors',async()=>{
 for(const data of [{items:Array(43).fill(items[0])},{items:[items[0],{...items[1],sku:'board-a'}]},{items:[{...items[0],id:'bad'}]},{items:[{...items[0],extra:'source text'}]},{items:[{...items[0],title:'\ud800'}]},{}])await assert.rejects(resolveGuideProduct(client({data,error:null}),'BOARD-A'));
 await assert.rejects(resolveGuideProduct(client({data:null,error:'denied'}),'BOARD-A'));
});
