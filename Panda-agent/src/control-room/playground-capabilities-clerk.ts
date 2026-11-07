import 'server-only';
import { controlRoomAdminAccess } from './clerk';
import { auth } from '@clerk/nextjs/server';
import { createPlaygroundCapabilitiesHandler, playgroundCapabilities } from './playground-capabilities';
import { localPlaygroundOwner, resolveBranchPlaygroundConfiguration as resolvePlaygroundConfiguration } from './playground-configuration';

export const playgroundCapabilitiesGET = createPlaygroundCapabilitiesHandler(controlRoomAdminAccess, async () => {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId) throw Error('Access unavailable');
  const connection = await resolvePlaygroundConfiguration();
  return playgroundCapabilities(process.env, connection?.transport === 'hosted', connection?.transport === 'local' && localPlaygroundOwner(connection.config, session.userId));
});
