import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const sources = {
  'server-only': 'export {}',
  '@clerk/nextjs/server': 'export const auth=async()=>globalThis.guardFixture.auth',
  '../server/lightweight-connection': 'export const authenticateLightweight=async()=>globalThis.guardFixture.actor; export const currentLightweightSession=(...args)=>globalThis.guardFixture.session(...args)',
  './playground-workflow-handler': 'export const createPlaygroundWorkflowHandler=authenticate=>async()=>authenticate();export const readWorkflowBody=async()=>({})',
  './snapshot-retrieval-clerk': 'export const snapshotRetrievalAdmission=async()=>({kind:"unavailable"})',
  '../retrieval/insforge-adapters': 'export const createInsforgeAdapters=()=>({})',
  '../retrieval/product-context-set': 'export const createWorkflowProductContextPreparer=()=>async()=>({})',
  '../server/basic-rag-profile': 'export const readBasicRagProfile=async()=>null',
  '../server/luna-test-profile': 'export const readLunaTestProfile=async()=>null',
  '../server/luna-prototype-profile': 'export const readLunaPrototypeProfile=async()=>null',
  '../server/basic-rag-runtime': 'export const createBasicRagPolicy=()=>({}); export const createLunaTestPolicy=createBasicRagPolicy; export const createLunaPrototypePolicy=createBasicRagPolicy',
  '../server/basic-rag-playground': 'export const createBasicRagPlayground=()=>({})',
  '../server/hosted-rag-policy': 'export const createHostedRagPolicy=()=>({})',
  '../server/hosted-rag-playground': 'export const createHostedRagPlayground=()=>({})',
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(sources, specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { authenticateRagWorkflow } = await import('../src/control-room/playground-workflow-clerk.ts');

test('each Admin source guard requires concurrent fresh session and role reads; revocation fails closed', async () => {
  let role = 'ADMIN', active = true, roles = 0, sessions = 0, started;
  const actor = { subject: 'owner', sessionId: 'session', admin: true, client: { database: { from: () => ({ select: () => ({ eq: () => ({ limit: async () => {
    roles++; started?.(); return { data: [{ role }], error: null };
  } }) }) }) } } };
  globalThis.guardFixture = { actor, auth: { isAuthenticated: true, sessionStatus: 'active', userId: 'owner', sessionId: 'session' },
    session: async (subject, session) => { assert.equal(subject, 'owner'); assert.equal(session, 'session'); sessions++; await new Promise(resolve => { started = resolve; }); return active; } };
  const admission = await authenticateRagWorkflow(new Request('http://localhost:3001/api/admin/rag-control-room/playground'));
  assert.equal(admission.kind, 'admin');
  const current = admission.dependencies.authorize;
  assert.equal(await current(), true);
  assert.equal(sessions, 1); assert.equal(roles, 1); // combined admission RPC plus a fresh guard
  role = 'CUSTOMER'; assert.equal(await current(), false);
  role = 'ADMIN'; active = false; assert.equal(await current(), false);
  assert.equal(sessions, 3); assert.equal(roles, 3);
  globalThis.guardFixture.auth.sessionId = 'another-session';
  assert.equal(await current(), false);
  assert.equal(sessions, 3); assert.equal(roles, 3);
});
