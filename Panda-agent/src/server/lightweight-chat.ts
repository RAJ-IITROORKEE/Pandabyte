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

const configuredMode=process.env.PANDA_AGENT_LIGHTWEIGHT_MODE;
if(configuredMode && configuredMode!=='deterministic-mcu-v1')throw Error('Unsupported Agent mode');
const mode=configuredMode==='deterministic-mcu-v1'?configuredMode:undefined;

export const lightweightChatHandlers=createLightweightHandler({
  enabled:()=>process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED==='true',
  authenticate:authenticateLightweight,
  current:actor=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false),
  store:actor=>({...createLightweightStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??''),guide:createGuideStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??'')}),
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
