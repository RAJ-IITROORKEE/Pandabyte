import 'server-only';
import {auth} from '@clerk/nextjs/server';
import {createInsforgeServerClient} from '@/lib/insforge/server';
import {controlRoomAdminAccess} from '../control-room/clerk';
import {createRuntimeInspectionHandlers} from './runtime-inspection';
import {localRuntimeStatus} from './local-runtime';

export async function productsGET(request: Request) {
  return createRuntimeInspectionHandlers({
    authenticate: async () => {
      const session=await auth();
      if(!session.isAuthenticated||session.sessionStatus!=='active'||!session.userId)return {kind:'unauthorized'};
      return {kind:'signed_in',client:await createInsforgeServerClient()};
    },runtimeStatus:localRuntimeStatus,
  }).productsGET(request);
}
export async function corpusGET(request: Request) {
  return createRuntimeInspectionHandlers({
    authenticate: async () => {
      const access=await controlRoomAdminAccess();
      if(!access.allowed)return {kind:access.status===401?'unauthorized':access.status===403?'forbidden':'unavailable'};
      return {kind:'admin',client:await createInsforgeServerClient()};
    },runtimeStatus:localRuntimeStatus,
  }).corpusGET(request);
}
