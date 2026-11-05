import 'server-only';
import {authenticateLightweight} from './lightweight-connection';
import {controlRoomAdminAccess} from '../control-room/clerk';
import {createRuntimeInspectionHandlers} from './runtime-inspection';
import {lightweightReady} from './lightweight-ready';

const runtimeStatus=async()=>({available:await lightweightReady(),mode:'lightweight_fastapi' as const,retrievalMethod:'lexical' as const});

export async function productsGET(request: Request) {
  return createRuntimeInspectionHandlers({
    authenticate: async () => {
      const actor=await authenticateLightweight();
      if(!actor)return {kind:'unauthorized'};
      return {kind:'signed_in',client:actor.client};
    },runtimeStatus,
  }).productsGET(request);
}
export async function corpusGET(request: Request) {
  return createRuntimeInspectionHandlers({
    authenticate: async () => {
      const access=await controlRoomAdminAccess();
      if(!access.allowed)return {kind:access.status===401?'unauthorized':access.status===403?'forbidden':'unavailable'};
      const actor=await authenticateLightweight();
      return actor?{kind:'admin',client:actor.client}:{kind:'unauthorized'};
    },runtimeStatus,
  }).corpusGET(request);
}
