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
};
registerHooks({resolve(specifier,context,next){
 if(context.parentURL && new URL(context.parentURL).pathname.endsWith('/server/lightweight-chat.ts')) {
  if(specifier==='server-only')return next(specifier,context);
  const source=specifier==='./lightweight-handler'?'export const createLightweightHandler=deps=>deps;':exportsByModule[specifier]?.map(name=>`export function ${name}(){return {};}`).join('\n');
  if(!source)throw Error('Unreviewed assembly dependency');
  return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};
 }
 return next(specifier,context);
}});
test('native journal is opt-in, recovery survives new-work disable, and the retired direct flag cannot select inference',async()=>{
 const names=['PANDA_AGENT_ASSISTANT_JOURNAL_ENABLED','PANDA_AGENT_ASSISTANT_NEW_MESSAGES','PANDA_AGENT_PLAIN_LLM_NEW_MESSAGES'];
 const before=names.map(name=>process.env[name]);
 try {
  for(const [journal,fresh,direct,registered] of [[false,false,false,false],[false,true,false,true],[true,false,false,true],[false,false,true,false]]) {
   names.forEach((name,i)=>process.env[name]=String([journal,fresh,direct][i]));
   const {lightweightChatHandlers:deps}=await import(`../src/server/lightweight-chat.ts?assembly=${journal}-${fresh}-${direct}`);
   assert.equal(typeof deps.llm==='function',registered);assert.equal(deps.llmNewMessages(),fresh);
   assert.equal(typeof deps.basicRag,'function');assert.equal(typeof deps.store,'function');
  }
 }finally{names.forEach((name,i)=>{if(before[i]===undefined)delete process.env[name];else process.env[name]=before[i];});}
});
