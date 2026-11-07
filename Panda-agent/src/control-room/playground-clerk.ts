import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createInsforgeServerClient } from '@/lib/insforge/server';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters';
import { createPlaygroundHandler, type Admission } from './playground-handler';
import { createHash } from 'node:crypto';
import { createPlaygroundModelEvaluator } from './playground-model';
import { createPlaygroundGatewayClient } from './playground-gateway';
import { createAwsGatewaySigner } from '../server/aws-gateway-signer';
import { matchApprovedPlaygroundCase, parseProductPlaygroundIntent } from './playground-intent';
import { localPlaygroundOwner, resolveBranchPlaygroundConfiguration as resolvePlaygroundConfiguration, sameLocalPlaygroundConfiguration } from './playground-configuration';
import { readLocalPlaygroundConfig } from './playground-local-config';
import { createLocalPlaygroundClient } from './playground-local';
import type { PlaygroundUsage } from './playground-usage';
import { controlRoomAdminAccess } from './clerk';

export async function playgroundPOST(request: Request) {
 return runPlaygroundPOST(request);
}

// Trusted server callers may bind a comparison snapshot; this is never read from browser JSON.
export async function runPlaygroundPOST(request: Request, expectedContextDigest?:string, expectedProvenanceDigest?:string) {
 const access = await controlRoomAdminAccess();
 if (!access.allowed) return Response.json({error:{code:access.status === 401 ? 'unauthorized' : access.status === 403 ? 'forbidden' : 'unavailable'}}, {status:access.status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 let usage:PlaygroundUsage|null=null;
 let resolvedSku: string | undefined;
 let subject: string | undefined;
 const connection = await resolvePlaygroundConfiguration();
 const authenticate = async ():Promise<Admission> => {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId) return { kind: 'unauthorized' };
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.from('staff_role_memberships').select('role').eq('user_id', session.userId).limit(1);
    if (error || !Array.isArray(data)) return { kind: 'unavailable' };
    if (data.length !== 1 || data[0]?.role !== 'ADMIN') return { kind: 'forbidden' };
    if (connection?.transport === 'local') {
        const current = await readLocalPlaygroundConfig();
        if (!current || !sameLocalPlaygroundConfiguration(connection.config, current) || !localPlaygroundOwner(current, session.userId)) return { kind:'unavailable' };
    }
    subject ??= session.userId;
    const adapters = createInsforgeAdapters(client, async () => ({ selections: [] }));
    const resolve = adapters.resolveIdentity;
    adapters.resolveIdentity = async (...args) => {
        const identity = await resolve(...args);
        if (identity.kind === 'resolved') resolvedSku = identity.product.sku;
        return identity;
    };
    return { kind: 'admin', actor: { subject: session.userId }, adapters };
 };
 // Enable only with the matching reviewed host receiver and shared admission profile.
 const evaluator = connection ? createPlaygroundModelEvaluator(async (modelRequest, signal, intent) => {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== 'active' || session.userId !== subject || !resolvedSku) throw Error('Playground unavailable');
    const userToken = await session.getToken();
    if (!userToken) throw Error('Playground unavailable');
    const input = JSON.parse(modelRequest.messages[1].content) as { question: string; passages: Array<{ rank: number; text: string }> };
    if (!intent || (connection.profile === 'mini-two-case-v1' ? !matchApprovedPlaygroundCase({ question: input.question, productSku: resolvedSku }) : !parseProductPlaygroundIntent({ requestId:intent.requestId, question:input.question, productSku:resolvedSku }))) throw Object.assign(Error('Playground case unavailable'), { code: 'not_admitted' });
    if (connection.transport === 'local' && (!localPlaygroundOwner(connection.config, session.userId) || new URL(request.url).origin !== 'http://localhost:3000')) throw Object.assign(Error('Local playground unavailable'), { code:'not_admitted' });
    const client = await createInsforgeServerClient();
    const { data, error } = await client.database.from('staff_role_memberships').select('role').eq('user_id', session.userId).limit(1);
    if (signal?.aborted || error || !Array.isArray(data) || data.length !== 1 || data[0]?.role !== 'ADMIN') throw Error('Playground access unavailable');
    const turn = {
        ...(connection.profile === 'product-playground-v1' ? { profile:'product-playground-v1' as const } : {}), question: input.question, productSku: resolvedSku, userToken, requestId: intent.requestId,
        contextDigest: createHash('sha256').update(JSON.stringify(input.passages)).digest('hex'), signal,
    };
    if (connection.transport === 'local') return createLocalPlaygroundClient(connection.config, { reauthorize:async () => {
        if (signal?.aborted) return false;
        const current = await authenticate();
        return current.kind === 'admin' && current.actor.subject === subject && !signal?.aborted;
    }, onUsage:value=>{usage=value;} })(turn);
    const config = connection.config;
    return createPlaygroundGatewayClient({ enabled: true, endpoint: config.endpoint, serviceToken: config.serviceToken, signer: createAwsGatewaySigner({ roleArn: config.roleArn }), onUsage:value=>{usage=value;} })(turn);
 }) : undefined;
 return createPlaygroundHandler(authenticate, evaluator, expectedContextDigest, ()=>usage,expectedProvenanceDigest)(request);
}
