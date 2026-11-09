import 'server-only';
import { createLightweightClient } from '../lightweight/client';
import { listRuntimeProducts } from '../retrieval/insforge-adapters';
import { authenticateLightweight, currentLightweightSession } from './lightweight-connection';
import { createLightweightHandler } from './lightweight-handler';
import { createLightweightStore } from './lightweight-store';
import { createLightweightAnswer } from './lightweight-answer';
import {createGuideStore} from './guide-store';
import {createGuideAnswer} from './guide-answer';
import {createGuideClient} from '../guide/client';
import {createDiagnosticStore} from './diagnostic-store';
import {createDiagnosticAnswer} from './diagnostic-answer';
import {createAgenticStore} from './agentic-store';
import {createAgenticAnswer} from './agentic-answer';
import {createMcpClient} from '../agentic/mcp-client';
import {nativeChatForActor} from './native-chat';
import {basicRagForActor} from './basic-rag-runtime';

const configuredMode=process.env.PANDA_AGENT_LIGHTWEIGHT_MODE;
if(configuredMode && configuredMode!=='deterministic-mcu-v1')throw Error('Unsupported Agent mode');
const mode=configuredMode==='deterministic-mcu-v1'?configuredMode:undefined;

export const lightweightChatHandlers=createLightweightHandler({
  enabled:()=>process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED==='true',
  authenticate:authenticateLightweight,
  current:actor=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false),
  ...(process.env.PANDA_AGENT_NATIVE_JOURNAL_ENABLED==='true'?{native:nativeChatForActor}:{}),
  nativeNewMessages:()=>process.env.PANDA_AGENT_NATIVE_NEW_MESSAGES==='true',
  basicRag:basicRagForActor,
  basicRagNewMessages:()=>process.env.PANDA_AGENT_BASIC_RAG_NEW_MESSAGES==='true',
  store:actor=>({...createLightweightStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??''),guide:createGuideStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??''),diagnostic:createDiagnosticStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??''),agentic:createAgenticStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'')}),
  agenticEnabled:()=>process.env.PANDA_AGENT_AGENTIC_ENABLED==='true',
  agenticAnswer:createAgenticAnswer({current:currentLightweightSession,baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}),
  agenticCancel:async(actor,execution,signal)=>{
    for(const call of execution.calls){if(!call.digest)continue;
      const args={subject:actor.subject,sessionId:actor.sessionId!,turnId:call.id,requestBodySha256:call.digest,signal};
      const result=call.toolId==='fetch_public_docs_mcp'?await createMcpClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}).cancel(args):call.scope?await createLightweightClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??'',mode:'deterministic-mcu-v1'}).cancel({...args,productSku:call.scope.sku}):null;
      if(result&&!(result.state==='complete'||(result.state==='rejected'&&result.code==='cancelled')))throw Error('Cancellation outcome unknown');
    }
  },
  diagnosticEnabled:()=>process.env.PANDA_AGENT_DIAGNOSTICS_ENABLED==='true',
  diagnosticAnswer:createDiagnosticAnswer({current:currentLightweightSession,externalEnabled:()=>process.env.PANDA_AGENT_VENDOR_SEARCH_ENABLED==='true'}),
  guideEnabled:()=>process.env.PANDA_AGENT_GUIDES_ENABLED==='true',
  guideAnswer:createGuideAnswer({current:currentLightweightSession,baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}),
  guideCancel:(actor,threadId,turnId,execution,signal)=>{
    if(!execution.prepared||!execution.digest||!execution.productSku)throw Error('Guide not prepared');
    return createGuideClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}).cancel({subject:actor.subject,sessionId:actor.sessionId!,threadId,turnId,productSku:execution.productSku,requestBodySha256:execution.digest,signal});
  },
  products:actor=>listRuntimeProducts(actor.client),
  cancel:(actor,turnId,execution,signal)=>createLightweightClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??'',mode}).cancel({subject:actor.subject,sessionId:actor.sessionId!,turnId,productSku:execution.sku,requestBodySha256:execution.digest,signal}),
  answer:createLightweightAnswer({
    mode,
    current:currentLightweightSession,
    clientForActor:()=>createLightweightClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??'',mode}),
  }),
});
