import { createHash, randomBytes } from 'node:crypto';
import { startNativeExecution } from '../../scripts/start-native-execution.mjs';
import { strictJson } from '../lightweight/client.ts';
import { assistantSystemPrompt, parseAssistantArtifact, type AssistantArtifact } from './assistant-artifacts.ts';
import { createNativeProviderGateway } from './native-provider-gateway.ts';
import { createNativeSessionClient } from './session-client.ts';
import { createNativeMessageID, createNativeReceipt, type NativeSessionReceipt } from './session-contracts.ts';
import { correlateNativeTurn } from './turn-result.ts';

type GatewayOptions = Parameters<typeof createNativeProviderGateway>[0];
type CallBinding = Parameters<GatewayOptions['reserve']>[0];
type Usage = Parameters<GatewayOptions['receipt']>[1];
type Admission = { receipt: NativeSessionReceipt; messageID: string; promptHash: string; generation: string };
type Options = {
  question: string; owner: string; rootRun: string; binding: string; signal: AbortSignal; workspaceRoot?: string;
  // These are durable CAS operations, not client-provided permission flags.
  saveAdmission(admission: Admission): Promise<boolean>;
  claimCreate(admission: Admission): Promise<boolean>;
  claimPrompt(admission: Admission): Promise<boolean>;
  current(admission?: Admission): Promise<boolean>;
  reserve: GatewayOptions['reserve']; receipt: GatewayOptions['receipt']; complete: GatewayOptions['complete'];
  onSucceeded?(result: { artifact: AssistantArtifact; usage: Usage }): Promise<boolean>;
};
type Result = { status: 'succeeded'; artifact: AssistantArtifact; usage: Usage; contextRetired: boolean } | { status: 'unknown' };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const unknown = (): Result => ({ status: 'unknown' });

/** One root, one prompt and one provider admission. Unknown outcomes are never retried. */
export async function runNativeAssistant(options: Options): Promise<Result> {
  const { question, owner, rootRun, binding, signal } = options;
  if (typeof question !== 'string' || !question.trim() || question !== question.trim() || question.length > 2000 || !question.isWellFormed()
    || ![owner, rootRun].every(v => typeof v === 'string' && !!v && v.length <= 512) || !/^[a-f0-9]{64}$/.test(binding) || signal.aborted) return unknown();
  const token = randomBytes(32).toString('hex'), receipt = createNativeReceipt('customer', binding), messageID = createNativeMessageID(), promptHash = hash(question);
  let runtime: Awaited<ReturnType<typeof startNativeExecution>> | undefined;
  let native: ReturnType<typeof createNativeSessionClient> | undefined;
  let admission: Admission | undefined, usage: Usage | undefined, cleanup = false;
  let success: Extract<Result, { status: 'succeeded' }> | undefined;
  const guard = async () => !!admission && !!runtime && !signal.aborted && await options.current(admission) && await runtime.current() && !signal.aborted;
  const check = async (r: NativeSessionReceipt) => !!admission && JSON.stringify(r) === JSON.stringify(admission.receipt) && await guard();
  const gateway = createNativeProviderGateway({ token, signal,
    authorize: async (bodyHash, messages) => {
      if (!admission || !native || !await guard() || messages.length !== 2) return null;
      const [system, user] = messages;
      if (!record(system) || system.role !== 'system' || typeof system.content !== 'string' || !system.content.startsWith(assistantSystemPrompt)
        || !record(user) || user.role !== 'user') return null;
      const text = typeof user.content === 'string' ? user.content : Array.isArray(user.content) && user.content.length === 1
        && record(user.content[0]) && user.content[0].type === 'text' ? user.content[0].text : null;
      if (text !== question) return null;
      const nativeMessages = await native.messages(receipt, check, signal);
      const users = nativeMessages.filter(m => m.type === 'user');
      if (users.length !== 1 || users[0].id !== messageID || users[0].type !== 'user' || hash(users[0].text) !== promptHash || !await guard()) return null;
      return { owner, rootRun, session: receipt.sessionID, message: messageID, step: '1', kind: 'main', bodyHash };
    },
    current: async (call: CallBinding) => !!admission && call.owner === owner && call.rootRun === rootRun && call.session === receipt.sessionID
      && call.message === messageID && call.step === '1' && call.kind === 'main' && await guard(),
    reserve: options.reserve,
    complete: options.complete,
    receipt: async (call, value) => { await options.receipt(call, value); usage = structuredClone(value); },
  });
  try {
    if (!await options.current() || signal.aborted) return unknown();
    const gatewayUrl = await gateway.listen();
    runtime = await startNativeExecution({ gatewayUrl, token, signal, ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}) });
    admission = { receipt, messageID, promptHash, generation: runtime.descriptor.generation };
    if (runtime.descriptor.version !== '2.2.6' || !await options.saveAdmission(admission) || !await guard()) return unknown();
    native = createNativeSessionClient({ ...runtime.descriptor, password: runtime.password, expectedPid: runtime.descriptor.pid, expectedVersion: '2.2.6', timeoutMs: 10000 });
    if (!await options.claimCreate(admission) || !await guard()) return unknown();
    await native.create(receipt, check, signal);
    if (!await options.claimPrompt(admission) || !await guard()) return unknown();
    await native.prompt(receipt, { messageID, text: question }, check, signal);
    const deadline = Date.now() + 40000;
    while (Date.now() < deadline && await guard()) {
      const [session, active, messages] = await Promise.all([native.get(receipt, check, signal), native.active(receipt, check, signal), native.messages(receipt, check, signal)]);
      const result = correlateNativeTurn({ messageID, promptHash }, session, active.active, messages);
      if (result.state === 'unknown') return unknown();
      if (result.state === 'terminal') {
        if (result.outcome !== 'succeeded' || !usage || !await guard()) return unknown();
        let value: unknown;
        try { value = strictJson(result.serializedAnswer); } catch { return unknown(); }
        const artifact = parseAssistantArtifact(value);
        if (!artifact || !['answer', 'clarification'].includes(artifact.type)) return unknown();
        if (options.onSucceeded && await options.onSucceeded({ artifact: structuredClone(artifact), usage: structuredClone(usage) }) === true && !signal.aborted) cleanup = true;
        if (signal.aborted) return unknown();
        success = { status: 'succeeded', artifact, usage, contextRetired: false };
        return success;
      }
      await new Promise<void>(resolve => setTimeout(resolve, 150));
    }
    return unknown();
  } catch { return unknown(); }
  finally {
    // Only a confirmed durable outcome permits removal of the isolated instance.
    try {
      if (runtime) {
        const preserveContext = !cleanup || signal.aborted;
        await runtime.close({ preserveContext });
        if (!preserveContext && success) success.contextRetired = true;
      }
    } catch { /* Preserve uncertainty. */ }
    try { await gateway.close(); } catch { /* No response or secret is exposed. */ }
  }
}
