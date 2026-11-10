import 'server-only';
import { controlRoomAdminAccess } from './clerk';
import { auth } from '@clerk/nextjs/server';
import { createPlaygroundCapabilitiesHandler, basicRagPlaygroundCapabilities } from './playground-capabilities';
import { readBasicRagProfile } from '../server/basic-rag-profile';
import { readLunaTestProfile } from '../server/luna-test-profile';
import { authenticateLightweight, currentLightweightSession } from '../server/lightweight-connection';
import { createLunaPrototypePolicy } from '../server/basic-rag-runtime';

export const playgroundCapabilitiesGET = createPlaygroundCapabilitiesHandler(controlRoomAdminAccess, async request => {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId) throw Error('Access unavailable');
  if (process.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE !== undefined) {
    if (!request) return basicRagPlaygroundCapabilities(false, 'prototype');
    const actor = await authenticateLightweight();
    if (!actor || actor.subject !== session.userId || !actor.sessionId) throw Error('Access unavailable');
    const policy = createLunaPrototypePolicy({ env: process.env, actor, subject: actor.subject, requestOrigin: new URL(request.url).origin,
      current: () => currentLightweightSession(actor.subject, actor.sessionId) });
    const ready = await policy.enabled() && await policy.current(), allowance = policy.allowance(), expiresAt = policy.expiresAt();
    return basicRagPlaygroundCapabilities(ready, 'prototype', allowance && expiresAt ? {remainingNanoUsd:allowance.remainingNanoUsd,expiresAt} : undefined);
  }
  const luna = process.env.PANDA_AGENT_LUNA_PROFILE_FILE !== undefined;
  const profile = request ? await (luna ? readLunaTestProfile : readBasicRagProfile)({ env: process.env, subject: session.userId, requestOrigin: new URL(request.url).origin }) : null;
  return basicRagPlaygroundCapabilities(profile !== null, luna ? 'luna' : 'free');
});
