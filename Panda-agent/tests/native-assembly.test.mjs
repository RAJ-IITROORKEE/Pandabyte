import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const exportsByModule={
 '../lightweight/client':['createLightweightClient'], '../retrieval/insforge-adapters':['listRuntimeProducts'],
 './lightweight-connection':['authenticateLightweight','currentLightweightSession'], './lightweight-store':['createLightweightStore'],
 './lightweight-answer':['createLightweightAnswer'], './guide-store':['createGuideStore'], './guide-answer':['createGuideAnswer'],
 '../guide/client':['createGuideClient'], './diagnostic-store':['createDiagnosticStore'], './diagnostic-answer':['createDiagnosticAnswer'],
 './agentic-store':['createAgenticStore'], './agentic-answer':['createAgenticAnswer'], '../agentic/mcp-client':['createMcpClient'],
 './native-chat':['nativeChatForActor'], './basic-rag-runtime':['basicRagForActor'], './native-assistant-chat':['nativeAssistantForActor'],
 './direct-assistant-runtime':['directAssistantForActor','researchWebSearchEnabled'],
};
registerHooks({resolve(specifier,context,next){
 if(context.parentURL && new URL(context.parentURL).pathname.endsWith('/server/lightweight-chat.ts')) {
  if(specifier==='server-only')return next(specifier,context);
  const source=specifier==='./lightweight-handler'?'export const createLightweightHandler=deps=>({...deps,messagePOST:async()=>Response.json({enabled:true})});'
   :specifier==='./chat-store'?'export class ChatStoreError extends Error{};':exportsByModule[specifier]?.map(name=>`export function ${name}(){return {};}`).join('\n');
  if(!source)throw Error('Unreviewed assembly dependency');
  return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};
 }
 return next(specifier,context);
}});
test('only the current direct flag selects inference; retired native flags cannot reenable new work',async()=>{
 const names=['PANDA_AGENT_DIRECT_ASSISTANT_ENABLED','PANDA_AGENT_ASSISTANT_JOURNAL_ENABLED','PANDA_AGENT_ASSISTANT_NEW_MESSAGES','PANDA_AGENT_PLAIN_LLM_NEW_MESSAGES'];
 const before=names.map(name=>process.env[name]);
 try {
  for(const flags of [[false,false,false,false],[false,true,false,false],[false,false,true,false],[false,false,false,true],[true,false,false,false],[true,true,true,true]]) {
   names.forEach((name,i)=>process.env[name]=String(flags[i]));
   const {lightweightChatHandlers:deps}=await import(`../src/server/lightweight-chat.ts?assembly=${flags.join('-')}`);
   assert.equal(typeof deps.llm==='function',flags[0]);assert.equal(deps.llmNewMessages(),flags[0]);
   assert.equal(deps.nativeNewMessages(),false);assert.equal(deps.basicRagNewMessages(),false);
   assert.equal(typeof deps.basicRag,'function');assert.equal(typeof deps.store,'function');
   assert.equal((await deps.messagePOST(new Request('http://localhost/api/panda-agent/chats/test/messages',{method:'POST'}),'test')).status,flags[0]?200:503);
  }
 }finally{names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];});}
});
