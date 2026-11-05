import 'server-only';
import { createLightweightClient } from '../lightweight/client';
import { listRuntimeProducts } from '../retrieval/insforge-adapters';
import { authenticateLightweight, currentLightweightSession } from './lightweight-connection';
import { createLightweightHandler } from './lightweight-handler';
import { createLightweightStore } from './lightweight-store';
import { createLightweightAnswer } from './lightweight-answer';

export const lightweightChatHandlers=createLightweightHandler({
  enabled:()=>process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED==='true',
  authenticate:authenticateLightweight,
  current:actor=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false),
  store:actor=>createLightweightStore(actor,process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY??''),
  products:actor=>listRuntimeProducts(actor.client),
  answer:createLightweightAnswer({
    current:currentLightweightSession,
    clientForActor:()=>createLightweightClient({baseUrl:process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'',secret:process.env.PANDA_AGENT_LIGHTWEIGHT_SECRET??''}),
  }),
});
