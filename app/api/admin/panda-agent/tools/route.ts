import {createAgenticToolsHandler} from '@/Panda-agent/src/server/agentic-tools-api';
import {authenticateLightweight,currentLightweightSession} from '@/Panda-agent/src/server/lightweight-connection';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handle=createAgenticToolsHandler({authenticate:authenticateLightweight,current:actor=>actor.sessionId?currentLightweightSession(actor.subject,actor.sessionId):Promise.resolve(false)});
export const GET=handle;
export const PATCH=handle;
