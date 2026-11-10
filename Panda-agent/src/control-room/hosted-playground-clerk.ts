import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { authenticateLightweight, currentLightweightSession } from '../server/lightweight-connection';
import { createHostedRagPolicy } from '../server/hosted-rag-policy';
import { createHostedRagPlayground } from '../server/hosted-rag-playground';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters';
import { createWorkflowProductContextPreparer } from '../retrieval/product-context-set';
import { controlRoomAdminAccess } from './clerk';
import { createPlaygroundCapabilitiesHandler } from './playground-capabilities';
import { createPlaygroundWorkflowHandler, readWorkflowBody, type WorkflowAdmission } from './playground-workflow-handler';
import { snapshotRetrievalAdmission } from './snapshot-retrieval-clerk';

async function hostedAccess(request: Request) {
  const actor = await authenticateLightweight({ admin: true });
  if (!actor) return { kind: 'unauthorized' as const };
  if (!('admin' in actor) || actor.admin !== true) return { kind: 'forbidden' as const };
  const { subject, sessionId, client } = actor;
  const current = async () => {
    try {
      const session = await auth();
      if (!session.isAuthenticated || session.sessionStatus !== 'active' || session.userId !== subject || session.sessionId !== sessionId) return false;
      const [active, role] = await Promise.all([currentLightweightSession(subject, sessionId),
        client.database.from('staff_role_memberships').select('role').eq('user_id', subject).limit(1)]);
      return active && !role.error && Array.isArray(role.data) && role.data.length === 1 && role.data[0]?.role === 'ADMIN';
    } catch { return false; }
  };
  const policy = createHostedRagPolicy({ env: process.env, subject, actor, current, requestOrigin: new URL(request.url).origin });
  return { kind: 'admin' as const, actor, current, policy };
}

async function modelAdmission(request: Request): Promise<WorkflowAdmission> {
  const access = await hostedAccess(request);
  if (access.kind !== 'admin') return access;
  const { actor, current, policy } = access;
  return { kind: 'admin', subject: actor.subject, dependencies: {
    authorize: current, generationScope: 'multiple_products', usagePolicy: 'bounded_luna_test',
    prepare: createWorkflowProductContextPreparer({ actor: { subject: actor.subject }, client: actor.client, authorizeCurrent: current,
      createAdapters: () => createInsforgeAdapters(actor.client, async () => ({ selections: [] })) }),
    generate: createHostedRagPlayground(policy),
  } };
}

export const hostedPlaygroundGET = createPlaygroundCapabilitiesHandler(controlRoomAdminAccess, async request => {
  if (!request) throw Error('Request unavailable');
  const access = await hostedAccess(request);
  if (access.kind !== 'admin') throw Error('Access unavailable');
  const ready = await access.policy.enabled();
  return { model: 'openai/gpt-6-luna', connection: ready ? 'configured_unverified' : 'not_configured',
    transport: ready ? 'hosted' : 'unconfigured', profile: ready ? 'hosted-rag-v1' : null, approvedQuestions: [] };
});

export async function hostedPlaygroundPOST(request: Request) {
  const started = performance.now();
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  const fail = (status: number, code: string) => Response.json({ error: { code } }, { status, headers });
  if (request.method !== 'POST') return fail(405, 'method_not_allowed');
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail(403, 'forbidden');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return fail(415, 'unsupported_media_type');
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
  let value: unknown;
  try { value = await readWorkflowBody(request, signal); }
  catch (error) {
    if (signal.aborted) return fail(503, 'unavailable');
    return error instanceof Error && error.message === 'too_large' ? fail(413, 'too_large') : fail(400, 'invalid_request');
  }
  const evaluate = !!value && typeof value === 'object' && !Array.isArray(value) && (value as { evaluate?: unknown }).evaluate === true;
  const parsed = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(value), signal });
  const timing = { databaseSnapshotMs: null as number | null };
  const handler = createPlaygroundWorkflowHandler(evaluate ? () => modelAdmission(request) : () => snapshotRetrievalAdmission(timing));
  const response = await handler(parsed);
  if (!response.ok) return response;
  const result = await response.json();
  return Response.json({ ...result, metrics: { ...result.metrics, elapsedMs: Math.round(performance.now() - started), ...(!evaluate && timing) } }, { headers });
}
