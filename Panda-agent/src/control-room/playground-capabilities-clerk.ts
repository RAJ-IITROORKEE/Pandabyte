import 'server-only';
import { controlRoomAdminAccess } from './clerk';
import { auth } from '@clerk/nextjs/server';
import { createPlaygroundCapabilitiesHandler, basicRagPlaygroundCapabilities } from './playground-capabilities';
import { readBasicRagProfile } from '../server/basic-rag-profile';
import { readLunaTestProfile } from '../server/luna-test-profile';

export const playgroundCapabilitiesGET = createPlaygroundCapabilitiesHandler(controlRoomAdminAccess, async request => {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId) throw Error('Access unavailable');
  const luna = process.env.PANDA_AGENT_LUNA_PROFILE_FILE !== undefined;
  const profile = request ? await (luna ? readLunaTestProfile : readBasicRagProfile)({ env: process.env, subject: session.userId, requestOrigin: new URL(request.url).origin }) : null;
  return basicRagPlaygroundCapabilities(profile !== null, luna ? 'luna' : 'free');
});
