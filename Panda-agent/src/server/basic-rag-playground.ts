import 'server-only';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { inspectLocalWindowsPrivacy } from '../control-room/playground-local-windows.ts';
import type { RagWorkflowDependencies } from '../control-room/rag-workflow.ts';
import { BasicRagProviderError, createBasicRagCompletion } from './basic-rag-openrouter.ts';
import { createLunaRagCompletion } from './luna-rag-openrouter.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const privateMode = (s: { uid: number; mode: number }) => process.platform === 'win32' || ((s.mode & 0o077) === 0 && (typeof process.getuid !== 'function' || s.uid === process.getuid()));
type Claim = { subject: string; requestId: string; binding: string; question: string; sourceDigest: string };

/** Exclusive persistent receipt; a claimed UUID is never dispatched a second time. */
export async function claimBasicRagPlayground(input: Claim): Promise<boolean> {
  if (!input.subject || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId)
    || !/^[a-f0-9]{64}$/.test(input.binding) || !/^[a-f0-9]{64}$/.test(input.sourceDigest) || !input.question) return false;
  const directory = path.resolve(process.cwd(), 'private', 'basic-rag-activation');
  const filename = path.join(directory, 'playground-claim-' + hash(JSON.stringify([input.subject, input.requestId])) + '.json');
  let created = false;
  try {
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || !privateMode(parent) || !samePath(await realpath(directory), directory)) return false;
    const handle = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    created = true;
    try {
      await handle.writeFile(JSON.stringify({ version: 1, requestId: input.requestId, ownerSha256: hash(input.subject), binding: input.binding, questionSha256: hash(input.question), sourceDigest: input.sourceDigest }));
      await handle.sync();
      const [file, entry, after] = await Promise.all([handle.stat(), lstat(filename), lstat(directory)]);
      if (!file.isFile() || !entry.isFile() || entry.isSymbolicLink() || file.nlink !== 1 || entry.nlink !== 1
        || file.dev !== entry.dev || file.ino !== entry.ino || !privateMode(file) || !privateMode(entry)
        || !after.isDirectory() || after.isSymbolicLink() || parent.dev !== after.dev || parent.ino !== after.ino
        || !privateMode(after) || !samePath(await realpath(directory), directory)
        || (process.platform === 'win32' && !await inspectLocalWindowsPrivacy(filename))) throw Error('Claim unavailable');
      return true;
    } finally { await handle.close(); }
  } catch (error) {
    if (created || (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw new BasicRagProviderError('outcome_unknown');
    return false;
  }
}

type Generate = NonNullable<RagWorkflowDependencies['generate']>;
type Options = {
  subject: string; requestOrigin: string; env: NodeJS.ProcessEnv; profile: { binding: string }; mode?: 'free' | 'luna' | 'prototype';
  availability: { enabled(): Promise<boolean>; current(): Promise<boolean>; dispatchCurrent(): boolean; key(): string; binding(): string; claimBudget?(input: {request:string;surface:'playground';fingerprint:string}):Promise<boolean> };
  claim?: typeof claimBasicRagPlayground;
  completion?: typeof createBasicRagCompletion;
};

/** The profile and source are rechecked after the durable claim and just before dispatch. */
export function createBasicRagPlayground(options: Options): Generate {
  const binding = options.profile.binding;
  const key = options.env.OPENROUTER_API_KEY ?? '';
  const policyCurrent = async () => {
    try { return options.requestOrigin === 'http://localhost:3001' && await options.availability.current() && options.availability.key() === key && options.availability.binding() === binding; }
    catch { return false; }
  };
  return async (input, beforeSend, signal) => {
    if (!await options.availability.enabled() || options.availability.key() !== key || options.availability.binding() !== binding) throw Object.assign(Error('Model unavailable'), { code: 'not_admitted' });
    const dispatchCurrent = () => options.availability.dispatchCurrent() && options.availability.key() === key && options.availability.binding() === binding;
    const complete = (options.completion ?? (options.mode === 'luna' || options.mode === 'prototype' ? createLunaRagCompletion : createBasicRagCompletion))({ apiKey: key, policyCurrent, dispatchCurrent,
      ...(options.mode === 'prototype' ? { preClaimCurrent: dispatchCurrent } : {}),
      claim: async () => {
        if (options.mode === 'prototype') return !!options.availability.claimBudget && await options.availability.claimBudget({ request: input.requestId, surface: 'playground', fingerprint: input.context.digest });
        if (!await (options.claim ?? claimBasicRagPlayground)({ subject: options.subject, requestId: input.requestId, binding, question: input.question, sourceDigest: input.context.digest })) return false;
        return options.mode !== 'luna' || !!options.availability.claimBudget && await options.availability.claimBudget({request:input.requestId,surface:'playground',fingerprint:input.context.digest});
      } });
    try {
      return await complete({ question: input.question, passages: input.context.passages.map(({ rank, text }) => ({ rank, text })) },
        async () => !signal.aborted && await beforeSend() && !signal.aborted, signal);
    } catch (error) {
      const code = error instanceof BasicRagProviderError
        ? error.code === 'rate_limited' ? 'quota' : error.code === 'outcome_unknown' || error.code === 'response_rejected' ? error.code : 'not_admitted'
        : 'outcome_unknown';
      throw Object.assign(Error('Model unavailable'), { code });
    }
  };
}
