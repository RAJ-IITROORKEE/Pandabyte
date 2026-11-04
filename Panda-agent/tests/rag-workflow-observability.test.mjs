import test from 'node:test';
import assert from 'node:assert/strict';

let network = 0;
globalThis.fetch = async () => { network++; throw Error('Offline fixture forbids network'); };
const {runRagWorkflow} = await import('../src/control-room/rag-workflow.ts');
const {withRunTree} = await import('langsmith/singletons/traceable');

const flags = ['LANGSMITH_TRACING', 'LANGSMITH_TRACING_V2', 'LANGCHAIN_TRACING', 'LANGCHAIN_TRACING_V2', 'LANGCHAIN_VERBOSE', 'LANGSMITH_API_KEY'];
async function isolatedEnvironment(fn) {
 const before = Object.fromEntries(flags.map(name => [name, process.env[name]]));
 try { for (const name of flags) delete process.env[name]; await fn(); }
 finally { for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value; }
}
function fixture() {
 let prepared = 0;
 const products = [{id:'fixture-id', sku:'ESPXC3', title:'PandaByte xC3'}];
 const passages = [{rank:1, productSku:'ESPXC3', productTitle:'PandaByte xC3', title:'xC3', sourceUrl:'https://example.invalid/x', capturedAt:'2026-11-04T00:00:00Z', sectionPath:['Specifications'], text:'4 MB SPI flash'}];
 const context = {kind:'ready', products, passages, digest:'a'.repeat(64), sourceProofs:[], revalidate:async()=>true};
 const deps = {authorize:async()=>true, prepare:async()=>{prepared++;return context;}, generationScope:'single_product', generate:async()=>{throw Error('Model must not run');}};
 return {deps, prepared:()=>prepared};
}
const input = () => ({question:'What flash does xC3 have?', evaluate:false, signal:new AbortController().signal});

test('standalone LangSmith key does not enable tracing or network access', async()=>isolatedEnvironment(async()=>{
 process.env.LANGSMITH_API_KEY = 'synthetic-fixture-only';
 const f=fixture(), result=await runRagWorkflow(input(), f.deps);
 assert.equal(result.outcome,'retrieved'); assert.equal(f.prepared(),1); assert.equal(network,0);
}));

test('an inherited active run tree is rejected before retrieval or network access', async()=>isolatedEnvironment(async()=>{
 const f=fixture();
 await withRunTree({tracingEnabled:true}, async()=>assert.rejects(runRagWorkflow(input(), f.deps), /observability unavailable/));
 assert.equal(f.prepared(),0); assert.equal(network,0);
}));
