import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { openLightweightConnection } from '../server/lightweight-connection';
import { createSnapshotClient } from '../retrieval/snapshot-client';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters';
import { createWorkflowProductContextPreparer } from '../retrieval/product-context-set';
import type { WorkflowAdmission } from './playground-workflow-handler';

/** Read-only request. The SQL snapshot is the authorization/source boundary; no model uses this client. */
export async function snapshotRetrievalAdmission(timing: { databaseSnapshotMs: number | null }): Promise<WorkflowAdmission> {
 try {
  const actor = await openLightweightConnection({ parallelSession: true, sessionVerification: 'request', snapshotTransport: true });
  if (!actor) return { kind: 'unauthorized' };
  const started = performance.now();
  const snapshot = Promise.resolve(actor.client.database.rpc('panda_agent_runtime_admin_snapshot')).then(result => {
   timing.databaseSnapshotMs = Math.round(performance.now() - started);
   return result;
  });
  const [result, active] = await Promise.all([snapshot, actor.sessionCurrent]);
  if (!active) return { kind: 'unauthorized' };
  if (result.error) {
   const code = (result.error as { details?: string }).details;
   return { kind: code === 'forbidden' ? 'forbidden' : 'unavailable' };
  }
  const client = createSnapshotClient(result.data);
  if (client.subject !== actor.subject) return { kind: 'unavailable' };
  const current = async () => {
   const session = await auth();
   return !!session.isAuthenticated && session.sessionStatus === 'active' && session.userId === actor.subject && session.sessionId === actor.sessionId;
  };
  return { kind: 'admin', subject: actor.subject, dependencies: {
   authorize: current,
   prepare: createWorkflowProductContextPreparer({ actor: { subject: actor.subject }, client,
    createAdapters: () => createInsforgeAdapters(client, async () => ({ selections: [] })), authorizeCurrent: current }),
  } };
 } catch { return { kind: 'unavailable' }; }
}
