// Phase D2: one hosted research turn on the host (phase-d-plan.md D2 R1). Extracted from the verified production path of
// scripts/test-native-research.mjs (model mode); every security check it makes is kept, test scenarios/captures/probes are not.
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { researchCodeFiles, researchMemoryBytes, researchImageId, researchProfileHash, researchConfig, verifiedResearchConfig, verifyResearchContainer, type ResearchProfileID } from '../opencode/research-runtime.ts';
import { createNativeReceipt, createNativeMessageID } from '../opencode/session-contracts.ts';
import { projectResearchTurn } from '../opencode/research-transcript.ts';
import { createResearchProviderGateway, deriveResearchFrontier, hashResearchValue, matchResearchStopResult } from '../opencode/research-provider-gateway.ts';
import { openResearchRuntimeStore, hashResearchJSON, type ResearchBinding, type ResearchRunReceipt } from './research-runtime-store.ts';
import { createResearchDockerTransport } from './research-docker-transport.ts';
import { reserveDockerHostSlot, releaseStaleDockerHostSlot } from './native-docker-host-quota.ts';
import { createResearchSearchBroker, verifyResearchAnswer } from './research-search-broker.ts';
import { searchHostedPublicWeb } from '../search/tavily.ts';
import { createResearchOpenRouter } from './research-openrouter.ts';
import { researchChatProfiles, type ResearchChatProfile, type ResearchFailure, type ResearchUsage } from './research-envelopes.ts';
import { buildResearchPromptBody } from '../opencode/research-image-binding.ts';
import { researchProfileSelection } from '../../runtime/opencode/research-profile.mjs';

export const researchTurnDeadlineMs = 300000, researchReadinessMs = 20000, researchAttestationMaxMs = 24 * 3600 * 1000;
export const researchInsufficientText = 'The available public sources did not provide enough verified evidence to answer this question.';
export const researchContextResetNote = '\n\nNote: earlier conversation context for this chat was reset.';
const genericDocWords = 'datasheet documentation docs official reference manual guide pinout example examples tutorial specification specs'.split(' ');
const exec = promisify(execFile), sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex'), hex = () => randomBytes(32).toString('hex');
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms));

export type ResearchCitationOut = { id: 'S1' | 'S2'; title: string; sourceUrl: string; capturedAt: string; quote: string; sectionPath: [] };
export type ResearchAnswerOut = { outcome: 'evidence' | 'insufficient'; text: string; citations: ResearchCitationOut[] };
export type RunnerResult = { state: 'evidence' | 'insufficient' | 'unknown' | 'failed'; reason?: ResearchFailure; answer?: ResearchAnswerOut; usage: ResearchUsage };
export type RunnerInput = { subjectHash: string; chatId: string; runId: string; profile: ResearchChatProfile; prompt: string };
export type RunnerHooks = { onProgress?(stage: 'searching_web' | 'checking_citations'): void; signal?: AbortSignal; onLease?(lease: string): Promise<void> | void };
export type Attestation = { version: 1; reviewedAt: string; expiresAt: string; keySha256: string; workspaceSha256: string; privacy: { paidTraining: false; publicPrompts: false; dataDiscount: false; logging: false; traces: 'langsmith_metadata_only' } };
export type HostProbes = { memAvailableKiB(): Promise<number>; diskAvailableKiB(dir: string): Promise<number>; memoryProof(pid: number, containerId: string): Promise<{ peakBytes: number; oomKill: number }> };
export type RunnerOptions = {
  root?: string; codeSource: string; slotDir?: string;
  keys(): Promise<{ openrouterKey: string; tavilyKey: string }>; attestation(): Promise<unknown>;
  fetcher?: typeof fetch; searchFetch?: typeof fetch; searchLookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  docker?: (args: string[], env?: Record<string, string>) => Promise<string>; host?: Partial<HostProbes>; now?: () => number; sleep?: (ms: number) => Promise<void>;
  // Test seams; production uses the real Docker transport and verifiers.
  // Opt-in host-gate diagnostics: receives only a short internal error code, never content. Production does not pass it.
  diagnostic?: (code: string) => void;
  transportFactory?: typeof createResearchDockerTransport; verifyContainer?: (inspect: unknown, expected: any) => boolean; verifyConfig?: (loaded: unknown, expected: any) => boolean;
};

/** Failure before any provider call could have been sent; the reason maps straight into a signed failed result. */
export class ResearchRunFailure extends Error { reason: ResearchFailure; constructor(reason: ResearchFailure) { super(reason); this.reason = reason; } }
class Cancelled extends Error {}

// ---- pure helpers (exported for tests) ----
export const researchBindingHash = (subjectHash: string, chatId: string, epoch: number) => sha('panda-research-binding-v1\n' + subjectHash + chatId + epoch);
export const emptyUsage = (): ResearchUsage => ({ calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 });

/** Query shape (letters/digits/space/hyphen, <=12 words, <=400 chars) and every word from the user's prompt or the generic documentation list. */
export function researchQueryInScope(query: unknown, promptText: string): boolean {
  if (typeof query !== 'string' || query.length > 400 || !/^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/.test(query)) return false;
  const words = query.toLowerCase().split(/[ -]/);
  if (words.length > 12) return false;
  const allowed = new Set([...promptText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), ...genericDocWords]);
  return words.every(word => allowed.has(word));
}
export const researchPromptPreface = 'Host rules: you may search only public documentation. Every search query must be 1 to 12 words using letters, digits, spaces or hyphens, and each word must come from the question below or be a generic documentation word (datasheet, documentation, docs, official, reference, manual, guide, pinout, example, tutorial, specification). Never put private data in a query. Answer only from returned excerpts and cite exact passages.\n\nQuestion:\n';
export const prefacedPrompt = (prompt: string) => researchPromptPreface + prompt;

/** Throws on any invalid field; returns the parsed attestation. keyHash is sha256 of the OpenRouter key. */
export function validateResearchAttestation(value: unknown, keyHash: string, now: number): Attestation {
  const a = value as Attestation, bad = () => new ResearchRunFailure('attestation_expired');
  if (value === null) throw bad(); // no attestation installed: not current, never a provider call
  if (!a || typeof a !== 'object' || Object.keys(a).sort().join(',') !== 'expiresAt,keySha256,privacy,reviewedAt,version,workspaceSha256' || a.version !== 1) throw new ResearchRunFailure('invalid');
  const p = a.privacy;
  if (!p || typeof p !== 'object' || JSON.stringify(p) !== JSON.stringify({ paidTraining: false, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' }) || !/^[a-f0-9]{64}$/.test(a.workspaceSha256) || a.keySha256 !== keyHash) throw new ResearchRunFailure('invalid');
  const reviewed = Date.parse(a.reviewedAt), expires = Date.parse(a.expiresAt);
  if (!Number.isFinite(reviewed) || !Number.isFinite(expires) || expires - reviewed > researchAttestationMaxMs || expires <= reviewed) throw new ResearchRunFailure('invalid');
  if (reviewed > now) throw new ResearchRunFailure('invalid');
  if (now >= expires) throw bad();
  return a;
}
export function aggregateResearchUsage(attempts: { state: string; result?: { usage?: { inputTokens: number; outputTokens: number; costNanoUsd: number } } }[]): ResearchUsage {
  const usage = emptyUsage();
  for (const a of attempts) {
    // A sent but unsettled call still counts as a call (cost unknown) so a reservation is never released while one may be in flight.
    if (a.state === 'sent') { usage.calls++; continue; }
    if (a.state !== 'settled' || !a.result?.usage) continue;
    usage.calls++; usage.inputTokens += a.result.usage.inputTokens; usage.outputTokens += a.result.usage.outputTokens; usage.costNanoUsd += a.result.usage.costNanoUsd;
  }
  return usage;
}
export function mapResearchAnswer(answer: { state: 'insufficient' } | { state: 'evidence'; answer: string; citations: { title: string; url: string; capturedAt: string; quote: string }[] }, contextReset = false): ResearchAnswerOut {
  const note = contextReset ? researchContextResetNote : '';
  if (answer.state === 'insufficient') return { outcome: 'insufficient', text: researchInsufficientText + note, citations: [] };
  return { outcome: 'evidence', text: answer.answer + note, citations: answer.citations.map((c, i) => ({ id: (i === 0 ? 'S1' : 'S2') as 'S1' | 'S2', title: c.title, sourceUrl: c.url, capturedAt: c.capturedAt, quote: c.quote, sectionPath: [] as [] })) };
}
/** Whether this turn needs a fresh epoch (new native session). `first` means no earlier epoch existed. */
export function decideEpoch(i: { meta: { epoch: number; profileHash: string } | null; profileHash: string; createState?: 'created' | 'existing' | 'conflict'; reconcile?: { create: 'new' | 'claimed' | 'created'; activeRun: string | null } | null }): { newEpoch: boolean; first: boolean } {
  if (!i.meta) return { newEpoch: true, first: true };
  const reuse = i.createState !== 'conflict' && i.meta.profileHash === i.profileHash && !!i.reconcile && i.reconcile.activeRun === null && i.reconcile.create !== 'claimed';
  return { newEpoch: !reuse, first: false };
}
export const mcpConnected = (value: any): boolean => Array.isArray(value?.data) && value.data.some((s: any) => s?.name === 'panda_research' && s?.status?.status === 'connected');
export function parseMemoryProof(containerId: string, cgroup: string, peak: string, events: string) {
  if (!/^[a-f0-9]{64}$/.test(containerId) || cgroup.trim() !== `0::/system.slice/docker-${containerId}.scope`) throw Error('memory_proof_cgroup');
  const numeric = (v: string) => { if (!/^(0|[1-9][0-9]{0,15})$/.test(v)) throw Error('memory_proof_value'); return Number(v); };
  const rows = events.trim().split('\n').map(line => line.split(' '));
  if (!rows.every(r => r.length === 2 && /^[a-z_]+$/.test(r[0])) || new Set(rows.map(r => r[0])).size !== rows.length) throw Error('memory_proof_events');
  const values = Object.fromEntries(rows.map(([k, v]) => [k, numeric(v)]));
  if (!Object.hasOwn(values, 'oom_kill')) throw Error('memory_proof_events');
  return { peakBytes: numeric(peak.trim()), oomKill: values.oom_kill as number };
}

// ---- runner ----
async function privateDir(dir: string, root: boolean) {
  try { await fs.mkdir(dir, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || process.platform !== 'win32' && ((st.mode & 0o777) !== 0o700 || st.uid !== process.getuid?.())) throw Error(root ? 'research_root_denied' : 'research_dir_denied');
}
async function atomicWrite(file: string, value: unknown) {
  const tmp = file + '.' + randomBytes(8).toString('hex') + '.tmp', h = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await h.writeFile(JSON.stringify(value)); await h.sync(); } finally { await h.close(); }
  await fs.rename(tmp, file);
}
async function readMeta(file: string, subjectHash: string, chatId: string): Promise<{ epoch: number; binding: ResearchBinding } | null> {
  let text: string;
  try { const st = await fs.lstat(file); if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > 8192) throw Error('meta_denied'); text = await fs.readFile(file, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  const m = JSON.parse(text), b = m?.binding;
  if (!Number.isSafeInteger(m?.epoch) || m.epoch < 1 || !b || b.owner !== subjectHash || b.binding !== researchBindingHash(subjectHash, chatId, m.epoch) || !/^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(b.sessionID)) throw Error('meta_invalid');
  return m;
}

export function createResearchTurnRunner(options: RunnerOptions) {
  const root = options.root ?? '/opt/panda-research', slotDir = options.slotDir ?? '/opt/panda-n45-admission', now = options.now ?? Date.now, sleep = options.sleep ?? pause;
  const docker = options.docker ?? (async (args: string[], env?: Record<string, string>) => (await exec('docker', args, { timeout: 65000, maxBuffer: 2097152, env: env ? ({ PATH: process.env.PATH, ...env } as unknown as NodeJS.ProcessEnv) : undefined })).stdout.trim());
  const host: HostProbes = {
    async memAvailableKiB() { return Number(/^MemAvailable:\s+(\d+)/m.exec(await fs.readFile('/proc/meminfo', 'utf8'))?.[1]); },
    async diskAvailableKiB(dir) { return Number((await exec('df', ['-Pk', dir])).stdout.trim().split('\n').at(-1)!.trim().split(/\s+/)[3]); },
    async memoryProof(pid, id) {
      const group = await fs.readFile(`/proc/${pid}/cgroup`, 'utf8'), dir = `/sys/fs/cgroup/system.slice/docker-${id}.scope`;
      if (group.trim() !== `0::/system.slice/docker-${id}.scope` || await fs.realpath(dir) !== dir) throw Error('memory_proof_cgroup');
      return parseMemoryProof(id, group, await fs.readFile(dir + '/memory.peak', 'utf8'), await fs.readFile(dir + '/memory.events', 'utf8'));
    }, ...options.host };
  let codeQueue: Promise<unknown> = Promise.resolve();

  async function readSource() { return Object.fromEntries(await Promise.all(researchCodeFiles.map(async name => [name, await fs.readFile(path.join(options.codeSource, name))]))) as Record<string, Buffer>; }
  // The shared read-only code mount, prepared once per profile hash and re-verified against the source on every turn.
  function ensureCode(profileHash: string, profile: ResearchProfileID, source: Record<string, Buffer>) {
    const job = codeQueue.catch(() => undefined).then(async () => {
      const final = path.join(root, 'code', profileHash), mount = path.join(final, 'mount'), files = Object.fromEntries(researchCodeFiles.map(n => [n, sha(source[n])]));
      const expected = JSON.stringify({ imageId: researchImageId, profileHash, profile, files });
      const verify = async () => {
        const manifest = await fs.readFile(path.join(mount, 'manifest.json'), 'utf8');
        if (manifest !== expected) throw Error('code_mount_mismatch');
        for (const n of researchCodeFiles) { const f = path.join(mount, n), st = await fs.lstat(f); if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o777) !== 0o444 && process.platform !== 'win32' || sha(await fs.readFile(f)) !== files[n]) throw Error('code_mount_mismatch'); }
      };
      try { await verify(); return mount; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      await privateDir(path.join(root, 'code'), false);
      const tmp = final + '.tmp-' + randomBytes(6).toString('hex'), tmount = path.join(tmp, 'mount'), directories = new Set<string>();
      await fs.mkdir(tmp, { mode: 0o700 }); await fs.mkdir(tmount, { mode: 0o755 });
      for (const n of researchCodeFiles) {
        const f = path.join(tmount, n), d = path.dirname(f);
        if (d !== tmount && !directories.has(d)) { await fs.mkdir(d, { mode: 0o700 }); directories.add(d); }
        await fs.writeFile(f, source[n], { mode: 0o444, flag: 'wx' }); await fs.chmod(f, 0o444);
      }
      for (const d of directories) await fs.chmod(d, 0o555);
      const m = path.join(tmount, 'manifest.json'); await fs.writeFile(m, expected, { mode: 0o444, flag: 'wx' }); await fs.chmod(m, 0o444); await fs.chmod(tmount, 0o555);
      await fs.rename(tmp, final); await verify(); return mount; // shortcut: a crashed prepare leaves a .tmp-* directory; clean it by hand.
    });
    codeQueue = job; return job as Promise<string>;
  }

  async function run(input: RunnerInput, hooks: RunnerHooks = {}): Promise<RunnerResult> {
    const { onProgress, signal, onLease } = hooks, started = now(), deadline = started + researchTurnDeadlineMs, profile: ResearchProfileID = input.profile;
    if (!Object.hasOwn(researchChatProfiles, profile)) throw new ResearchRunFailure('invalid');
    const lease = 'panda-n45-' + randomBytes(16).toString('hex'), promptText = prefacedPrompt(input.prompt), digest = sha(promptText);
    let slot: Awaited<ReturnType<typeof reserveDockerHostSlot>> | null = null, store: Awaited<ReturnType<typeof openResearchRuntimeStore>>, ctx: any = { lease }, promptClaimed = false, attNow: Attestation | null = null;
    let usage = emptyUsage(), contextReset = false, cancelled = false;
    const check = () => { if (signal?.aborted) { cancelled = true; throw new Cancelled(); } if (now() > deadline) throw Error('turn_deadline'); };
    const need = (ok: unknown, why: string) => { if (!ok) throw Error(why); };
    const attCurrent = () => !!attNow && now() < Date.parse(attNow.expiresAt);
    const json = async (method: string, route: string, body?: unknown) => { const r = await ctx.transport.request(method, route, body); need(r.status === 200, 'native_status'); return JSON.parse(r.body); };
    const owned = async () => {
      const [info, session] = await Promise.all([json('GET', '/api/info'), json('GET', '/api/session/' + ctx.binding.sessionID)]);
      need(info.version === '2.2.5' && Number.isSafeInteger(info.pid) && info.pid > 0, 'native_info'); if (ctx.pid) need(info.pid === ctx.pid, 'native_pid'); else ctx.pid = info.pid;
      const d = session.data; need(d.id === ctx.binding.sessionID && hashResearchJSON(d.metadata.pandaResearch) === hashResearchJSON({ binding: ctx.binding.binding, owner: ctx.binding.owner, profileHash: ctx.profileHash }), 'native_owner'); return d;
    };
    const messages = async () => {
      const rows: any[] = []; let cursor: string | undefined;
      for (let page = 0; page < 4; page++) {
        const r = await json('GET', `/api/session/${ctx.binding.sessionID}/message?${cursor ? 'limit=100&cursor=' + encodeURIComponent(cursor) : 'limit=100&order=asc'}`);
        need(Array.isArray(r.data), 'native_messages'); rows.push(...r.data); need(rows.length <= 200 && Buffer.byteLength(JSON.stringify(rows)) <= 1048576, 'message_bounds');
        cursor = r.cursor?.next; if (!cursor) return rows;
      } throw Error('message_bounds');
    };
    const observation = async () => {
      const [state, activity, rows] = await Promise.all([owned(), json('GET', '/api/session/active'), messages()]), active = Object.hasOwn(activity.data, ctx.binding.sessionID);
      return { state, rows, active, result: projectResearchTurn({ messageID: ctx.run.messageID, promptHash: ctx.run.promptHash }, { ...(state.outcome ? { outcome: state.outcome } : {}), time: state.time }, active, rows, ['panda_research_search']) as any };
    };
    const waitTerminal = async () => { for (;;) { check(); const o = await observation(); if (o.result.state === 'terminal') return o; await sleep(100); } };
    const identity = (o: { kind: string; key: string; requestHash: string }) => ({ kind: o.kind as 'primary' | 'tool', key: o.key, requestHash: o.requestHash });

    async function remove(release = true): Promise<{ memoryOk: boolean }> {
      // Closing must never prevent the container removal and its proof below.
      try { await ctx.transport?.close(); } catch { /* removal follows */ }
      try { await ctx.gateway?.close(); } catch { /* removal follows */ }
      if (!ctx.containerId && ctx.createOutcome === 'uncertain') {
        const found = await docker(['ps', '-aq', '--no-trunc', '--filter', 'name=^/' + lease + '$']);
        need(/^[a-f0-9]{64}$/.test(found), 'uncertain_create_retains_slot'); ctx.containerId = found;
      }
      let memoryOk = true;
      if (ctx.containerId) {
        const inspect = JSON.parse(await docker(['inspect', ctx.containerId]))[0];
        need(inspect.Image === researchImageId && inspect.Config.Labels['panda.native.lease'] === lease && inspect.Config.Labels['panda.research.binding'] === ctx.binding.binding && inspect.Config.Labels['panda.research.profile'] === ctx.profileHash, 'remove_identity');
        try {
          const pid = inspect.State.Pid;
          if (!(pid === 0 && inspect.State.Status === 'created')) { need(Number.isSafeInteger(pid) && pid > 0, 'memory_proof_pid'); need((await host.memoryProof(pid, ctx.containerId)).oomKill === 0, 'container_oom_kill'); }
        } catch { memoryOk = false; }
        await docker(['rm', '-f', ctx.containerId]); need(await docker(['ps', '-aq', '--no-trunc', '--filter', 'id=' + ctx.containerId]) === '', 'container_not_removed');
        ctx.containerId = null; ctx.createOutcome = 'removed';
      }
      if ((release || !memoryOk) && slot) { await slot.release(); slot = null; }
      return { memoryOk };
    }

    async function launch() {
      const labels = { 'panda.research.binding': ctx.binding.binding, 'panda.research.profile': ctx.profileHash, 'panda.native.lease': lease };
      ctx.environment = { PANDA_NATIVE_PASSWORD: hex(), PANDA_RESEARCH_CHANNEL_TOKEN: hex(), PANDA_RESEARCH_GENERATION: ctx.generation, PANDA_RESEARCH_PROFILE: profile };
      const mem = `${researchMemoryBytes / 1048576}m`;
      const args = ['create', '--pull=never', '--name', lease, '--network', 'none', '--user', '10001:10001', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', mem, '--memory-swap', mem, '--cpus', '1', '--pids-limit', '128', '--workdir', '/runtime/workspace',
        '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700', '--mount', `type=bind,source=${ctx.nativeDirectory},target=/runtime`, '--mount', `type=bind,source=${ctx.codeDirectory},target=/research-code,readonly`];
      for (const [k, v] of Object.entries(labels)) args.push('--label', k + '=' + v);
      for (const key of Object.keys(ctx.environment)) args.push('--env', key);
      args.push('--entrypoint', 'node', researchImageId, '/research-code/research-controller.mjs');
      ctx.createOutcome = 'uncertain'; const created = await docker(args, ctx.environment); need(/^[a-f0-9]{64}$/.test(created), 'create_receipt'); ctx.containerId = created; ctx.createOutcome = 'created';
      const inspect = JSON.parse(await docker(['inspect', ctx.containerId]))[0];
      need((options.verifyContainer ?? verifyResearchContainer)(inspect, { containerId: ctx.containerId, nativeDirectory: ctx.nativeDirectory, codeDirectory: ctx.codeDirectory, labels, environment: ctx.environment, imageMetadata: ctx.image }), 'container_inspection');
      await docker(['start', ctx.containerId]); await attach();
    }

    async function attach() {
      ctx.transport = (options.transportFactory ?? createResearchDockerTransport)({ containerId: ctx.containerId, sessionID: ctx.binding.sessionID, generation: ctx.generation, profile, directory: '/runtime/workspace', ownership: { binding: ctx.binding.binding, owner: ctx.binding.owner, profileHash: ctx.profileHash } });
      const generation = ctx.generation, att = attNow!, creds = ctx.creds;
      ctx.model = createResearchOpenRouter({ profile: profile as any, apiKey: creds.openrouterKey, workspaceSha256: att.workspaceSha256, privacyProfileHash: hashResearchJSON(att), nativeProfileHash: ctx.profileHash,
        policyCurrent: async () => attCurrent() && !!ctx.run && await store.current(ctx.run), dispatchCurrent: () => ctx.generation === generation && !!ctx.containerId && attCurrent(), ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
      const gatewayOptions = {
        token: ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN, sessionID: ctx.binding.sessionID, generation, profile, signal: new AbortController().signal, denied: async () => {},
        authorize: async (id: any) => {
          if (!ctx.run || !await store.current(ctx.run)) return null;
          await owned(); const record = await store.readRun(ctx.run); if (!record) return null;
          const duplicate = record.operations.find(op => op.kind === 'primary' && op.requestHash === id.requestHash);
          if (duplicate) return { receipt: ctx.run, operation: identity(duplicate), prepared: null };
          const attempts: any[] = [];
          for (const op of record.operations.filter(op => op.kind === 'primary' && op.state === 'settled')) {
            const r = await store.recoverOperation(ctx.run, identity(op)); if (r.state !== 'cached') return null;
            attempts.push({ attemptKey: op.key, requestHash: op.requestHash, resultHash: op.resultHash, result: r.result, ...(op.association ? { assistantMessageID: op.association.assistantMessageID } : {}) });
          }
          const frontier = deriveResearchFrontier(ctx.run, await messages(), attempts, id.body, profile, (a: any) => ctx.model.verifyResult(a.result, a.requestHash)); if (!frontier) return null;
          for (const assoc of frontier.associations) {
            const op = record.operations.find(o => o.key === assoc.attemptKey), step = frontier.frontier.steps.find((s: any) => s.attemptKey === assoc.attemptKey);
            if (!op || !step || !await store.associateOperation(ctx.run, identity(op), { assistantMessageID: assoc.assistantMessageID, callsDigest: hashResearchValue(step.calls) })) return null;
          }
          const prepared = await ctx.model.prepare(id.body, new AbortController().signal);
          return Object.freeze({ receipt: structuredClone(ctx.run), operation: { kind: 'primary' as const, key: hashResearchValue(frontier.frontier), requestHash: id.requestHash }, prepared });
        },
        current: (b: any) => store.current(b.receipt), claim: (b: any) => store.claimOperation(b.receipt, b.operation), beforeSend: (b: any) => store.markSending(b.receipt, b.operation),
        settle: async (b: any, grant: any, result: any) => { need(await store.settleOperation(b.receipt, b.operation, grant.grant, result), 'settle_failed'); },
        authorizeRelease: (b: any, result: any) => store.authorizeRelease(b.receipt, b.operation, hashResearchJSON(result)),
        verifyHostedResult: (b: any, result: any, id: any) => ctx.model.verifyResult(result, id.requestHash) && (!b.prepared || result.receipt.wireRequestHash === b.prepared.wireRequestHash),
        complete: async (body: any, beforeSend: any, sig: AbortSignal, b: any) => { need(b.prepared && b.prepared.nativeRequestHash === hashResearchValue(body), 'prepared_mismatch'); return ctx.model.complete(b.prepared, beforeSend, sig); },
      };
      ctx.gateway = createResearchProviderGateway(gatewayOptions as any);
      await ctx.transport.provider(async (request: any) => ctx.gateway.handle({ ...request, headers: { ...request.headers, authorization: 'Bearer ' + ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN } }));
      const broker = createResearchSearchBroker({ store, binding: ctx.binding, generation, currentReceipt: () => ctx.run ?? null,
        readNative: async () => { const [session, activity, rows] = await Promise.all([owned(), json('GET', '/api/session/active'), messages()]); return { session, active: Object.hasOwn(activity.data, ctx.binding.sessionID), messages: rows }; },
        allowPublicQuery: q => researchQueryInScope(q, input.prompt),
        search: (query, beforeSend, sig) => searchHostedPublicWeb(query, { apiKey: creds.tavilyKey, signal: sig, beforeSend: async () => { const allowed = await beforeSend(); if (allowed) onProgress?.('searching_web'); return allowed; },
          ...(options.searchFetch ? { fetchImpl: options.searchFetch } : {}), ...(options.searchLookup ? { lookupImpl: options.searchLookup as any } : {}) }) });
      await ctx.transport.broker((request: any) => broker.handle(request));
      const end = now() + 60000; for (;;) { check(); try { const info = await json('GET', '/api/info'); need(info.version === '2.2.5', 'native_version'); ctx.pid = info.pid; break; } catch { if (now() > end) throw Error('native_readiness_timeout'); await sleep(100); } }
      need((options.verifyConfig ?? verifiedResearchConfig)(await json('GET', '/api/config'), researchConfig(generation, ctx.environment.PANDA_RESEARCH_CHANNEL_TOKEN, profile as any)), 'config_unverified');
    }

    // OpenCode 2.2.5 auto-connects config-declared MCP servers a few seconds after start; never prompt before the tool is connected.
    async function waitMcp() {
      const end = now() + researchReadinessMs;
      for (;;) { check(); if (mcpConnected(await json('GET', '/api/mcp'))) return; if (now() >= end) throw new ResearchRunFailure('tool_not_ready'); await sleep(200); }
    }

    async function modelFinal() {
      const observed = await waitTerminal(); need(observed.result.outcome === 'succeeded', 'native_not_succeeded');
      const record = (await store.readRun(ctx.run))!, primary = record.operations.filter(op => op.kind === 'primary'), attempts: any[] = [];
      for (const op of primary) {
        const r = await store.recoverOperation(ctx.run, identity(op)); need(r.state === 'cached' && ctx.model.verifyResult(r.result, op.requestHash), 'attempt_unverified');
        attempts.push({ attemptKey: op.key, requestHash: op.requestHash, resultHash: op.resultHash, result: r.result, ...(op.association ? { assistantMessageID: op.association.assistantMessageID } : {}) });
      }
      const verify = (a: any) => ctx.model.verifyResult(a.result, a.requestHash);
      const proof = matchResearchStopResult({ profile, receipt: ctx.run, record, session: observed.state, active: observed.active, messages: observed.rows, attempts }, verify); need(proof, 'stop_unmatched');
      const final = primary.find(op => op.key === proof!.operationKey); need(final, 'stop_operation');
      need(await store.associateOperation(ctx.run, identity(final!), { assistantMessageID: proof!.assistantMessageID, callsDigest: proof!.callsDigest }), 'associate_failed');
      const user = observed.rows.findIndex((r: any) => r.id === ctx.run.messageID); const assistants = observed.rows.slice(user + 1).filter((r: any) => r.type === 'assistant'); need(assistants.length === attempts.length, 'assistant_count');
      // Native token accounting must equal the verified provider receipts, or the turn is unknown.
      for (const [i, a] of attempts.entries()) {
        const u = a.result.usage, rc = a.result.receipt, write = rc.usageReceipt.prompt_tokens_details?.cache_write_tokens ?? 0;
        need(hashResearchJSON(assistants[i].tokens) === hashResearchJSON({ input: Math.max(0, u.inputTokens - rc.cachedTokens - write), output: Math.max(0, u.outputTokens - rc.reasoningTokens), reasoning: rc.reasoningTokens, cache: { read: rc.cachedTokens, write } }), 'native_usage_mismatch');
      }
      const catalog: any[] = [];
      for (const tool of observed.result.tools) {
        if (tool.status !== 'completed') continue; need(tool.name === 'panda_research_search', 'tool_name');
        const key = hashResearchJSON({ runID: ctx.run.runID, assistantMessageID: tool.assistantMessageID, toolID: tool.id }), op = record.operations.find(v => v.kind === 'tool' && v.key === key); need(op, 'tool_operation');
        const r: any = await store.recoverOperation(ctx.run, identity(op!)); need(r.state === 'cached', 'tool_unrecovered');
        need(JSON.stringify(tool.content) === JSON.stringify(r.result.mcp.content.map((p: any) => p.text)), 'tool_content');
        need(await store.authorizeRelease(ctx.run, identity(op!), op!.resultHash!), 'release_denied'); catalog.push({ operationKey: op!.key, resultHash: op!.resultHash, receipt: r.result.receipt });
      }
      onProgress?.('checking_citations');
      const answer = verifyResearchAnswer(observed.result.text, catalog, proof!.content); need(answer.state !== 'invalid', 'answer_invalid');
      if (answer.state === 'evidence') for (const use of answer.usedSources) { const op = record.operations.find(v => v.key === use.operationKey); need(op && await store.authorizeRelease(ctx.run, identity(op), use.resultHash), 'release_denied'); }
      need(await store.authorizeRelease(ctx.run, identity(final!), proof!.resultHash), 'release_denied');
      return { answer, catalog, observed, proof: proof!, record, attempts, receipt: structuredClone(ctx.run) };
    }
    const terminalFromObservation = (v: any, o: any) => {
      if (o.active !== false || o.result.state !== 'terminal' || o.result.outcome !== 'succeeded') return null;
      const proof = matchResearchStopResult({ profile, receipt: v.receipt, record: v.record, session: o.state, active: o.active, messages: o.rows, attempts: v.attempts }, (a: any) => ctx.model.verifyResult(a.result, a.requestHash));
      if (!proof || hashResearchJSON(proof) !== hashResearchJSON(v.proof) || hashResearchJSON(verifyResearchAnswer(proof.content, v.catalog, proof.content)) !== hashResearchJSON(v.answer) || !attCurrent()) return null;
      return { sessionID: ctx.binding.sessionID, messageID: v.receipt.messageID, promptHash: v.receipt.promptHash, outcome: 'succeeded' as const, active: false as const };
    };
    async function recheckRelease(v: any) {
      need(terminalFromObservation(v, await observation()), 'terminal_recheck');
      for (const key of new Set([v.proof.operationKey, ...(v.answer.state === 'evidence' ? v.answer.usedSources.map((u: any) => u.operationKey) : [])])) {
        const op = v.record.operations.find((o: any) => o.key === key); need(op && await store.authorizeRelease(v.receipt, identity(op), op.resultHash), 'release_denied');
      }
    }
    async function finish(v: any) {
      await recheckRelease(v);
      // The authority holds its lock here: native reads and frozen receipts only, never nested store calls.
      need(await store.finishRun(v.receipt, async () => terminalFromObservation(v, await observation())), 'finish_failed'); need(await store.current(v.receipt) === false, 'finish_failed');
    }
    const settledUsage = async () => { try { if (!ctx.run || !store) return usage; const rec = await store.readRun(ctx.run); if (!rec) return usage; const items: any[] = []; for (const op of rec.operations.filter(o => o.kind === 'primary')) { const r = op.state === 'settled' ? await store.recoverOperation(ctx.run, identity(op)) : null; items.push({ state: op.state, result: r?.state === 'cached' ? r.result : undefined }); } return aggregateResearchUsage(items); } catch { return usage; } };

    let result: RunnerResult | undefined, memoryOk = true;
    try {
      // 1. admission: busy -> signed failed:busy before anything else is touched
      await onLease?.(lease);
      slot = await reserveDockerHostSlot(slotDir, lease, true); if (!slot) throw new ResearchRunFailure('busy');
      // 2. attestation, credentials, host preflight (no provider call possible yet)
      ctx.creds = await options.keys(); attNow = validateResearchAttestation(await options.attestation(), sha(ctx.creds.openrouterKey), now());
      const image = JSON.parse(await docker(['image', 'inspect', researchImageId])); need(image.length === 1 && image[0].Id === researchImageId && image[0].Architecture === 'arm64', 'image_mismatch'); ctx.image = image[0];
      await privateDir(root, true);
      // Memory dips briefly after the previous turn's container is removed on this small host; wait (bounded, before any provider call) for it to recover.
      for (let waited = 0; await host.memAvailableKiB() < 1048576; waited += 500) { if (waited >= 15000) throw new ResearchRunFailure('busy'); check(); await sleep(500); }
      if (await host.diskAvailableKiB(root) < 2097152) throw new ResearchRunFailure('busy');
      const source = await readSource(); ctx.profileHash = researchProfileHash(source, profile); ctx.codeDirectory = await ensureCode(ctx.profileHash, profile, source);
      // 3. per-chat layout and epoch
      const chatDir = path.join(root, 'chats', input.subjectHash, input.chatId);
      await privateDir(path.join(root, 'chats'), false); await privateDir(path.join(root, 'chats', input.subjectHash), false); await privateDir(chatDir, false); await privateDir(path.join(chatDir, 'store'), false);
      store = await openResearchRuntimeStore(path.join(chatDir, 'store'), { isCurrent: () => attCurrent() });
      const metaFile = path.join(chatDir, 'meta.json'), meta = await readMeta(metaFile, input.subjectHash, input.chatId);
      let createState: 'created' | 'existing' | 'conflict' | undefined, rec: any = null;
      if (meta) { createState = (await store.createBinding(meta.binding)).state as any; if (createState !== 'conflict') rec = await store.reconcile(meta.binding); }
      const decision = decideEpoch({ meta: meta && { epoch: meta.epoch, profileHash: meta.binding.profileHash }, profileHash: ctx.profileHash, createState, reconcile: rec });
      let epoch = meta?.epoch ?? 1, binding = meta?.binding as ResearchBinding;
      if (decision.newEpoch) {
        epoch = (meta?.epoch ?? 0) + 1; const bindingHash = researchBindingHash(input.subjectHash, input.chatId, epoch);
        binding = { binding: bindingHash, owner: input.subjectHash, sessionID: createNativeReceipt('playground', bindingHash).sessionID, profileHash: ctx.profileHash, imageId: researchImageId, created: now() };
        await atomicWrite(metaFile, { epoch, binding }); // sidecar first: a crash before createBinding rebuilds from it
        need((await store.createBinding(binding)).state === 'created', 'binding_conflict'); rec = await store.reconcile(binding); contextReset = !decision.first;
      }
      need(rec, 'binding_unreadable'); ctx.binding = binding; ctx.generation = hex();
      need(await store.startGeneration(binding, rec.generation, ctx.generation), 'generation_failed');
      ctx.nativeDirectory = path.join(chatDir, 'store', 'bindings', binding.binding, 'native');
      try { await fs.mkdir(ctx.nativeDirectory, { mode: 0o700 }); await fs.chown(ctx.nativeDirectory, 10001, 10001); await fs.mkdir(path.join(ctx.nativeDirectory, 'workspace'), { mode: 0o700 }); await fs.chown(path.join(ctx.nativeDirectory, 'workspace'), 10001, 10001); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
      // 4. container, readiness, session once per epoch
      check(); await launch(); await waitMcp();
      if (rec.create !== 'created') {
        need((await store.claimCreate(binding, ctx.generation)).state === 'dispatch', 'create_claim');
        await json('POST', '/api/session', ctx.transport.createBody); await owned(); need(await store.markCreated(binding, ctx.generation, { sessionID: binding.sessionID, profileHash: ctx.profileHash }), 'mark_created');
      } else await owned();
      // 5. prompt: the first provider call can only follow claimPrompt, so failures before it are safe-to-retry
      const messageID = createNativeMessageID(), built = buildResearchPromptBody({ messageID, text: promptText, image: null, vision: false }); need(!('error' in built), 'prompt_rejected');
      // input.runId is the deterministic envelope runId (signed, in the request file); the store's run id is an independent random UUID.
      ctx.run = { binding: binding.binding, owner: binding.owner, runID: randomUUID(), messageID, promptHash: digest, sourceRevision: '0'.repeat(64), generation: ctx.generation } as ResearchRunReceipt;
      const admitted = await store.admitRun(ctx.run); if (admitted.state !== 'admitted') throw new ResearchRunFailure(attCurrent() ? 'invalid' : 'attestation_expired');
      check(); // claimPrompt writes nothing when it refuses, so a refusal here provably sent nothing and stays failed:invalid.
      need((await store.claimPrompt(ctx.run)).state === 'dispatch', 'prompt_claim'); promptClaimed = true;
      need((await json('POST', `/api/session/${binding.sessionID}/prompt`, (built as any).body)).data, 'prompt_rejected');
      if (!await store.markPromptAccepted(ctx.run)) throw Error('prompt_not_accepted');
      const verified = await modelFinal(); check(); await finish(verified);
      if (signal?.aborted) { cancelled = true; throw new Cancelled(); } // a cancel that raced the finish is never reported as evidence
      result = { state: verified.answer.state as 'evidence' | 'insufficient', answer: mapResearchAnswer(verified.answer as any, contextReset), usage: aggregateResearchUsage(verified.attempts.map(a => ({ state: 'settled', result: a.result }))) };
    } catch (error) {
      try { options.diagnostic?.((error instanceof Error ? error.message : 'error').replace(/[^a-z_0-9:.-]/gi, '_').slice(0, 80)); } catch { /* diagnostics never affect the result */ }
      // Cancel: fence the run, interrupt native work, then fall through to removal. Never an evidence result.
      if (cancelled && ctx.run && store!) { try { await store.cancelRun(ctx.run, 'cancelled'); } catch { /* the container removal below still fences it */ } try { await ctx.transport?.request('POST', `/api/session/${ctx.binding.sessionID}/interrupt?resume=false`, {}); } catch { /* removal follows */ } }
      usage = await settledUsage();
      result = promptClaimed ? { state: 'unknown', usage }
        : { state: 'failed', reason: error instanceof ResearchRunFailure ? error.reason : 'invalid', usage };
    } finally {
      try { memoryOk = (await remove()).memoryOk; } catch { memoryOk = false; if (result?.state === 'evidence' || result?.state === 'insufficient') result = { state: 'unknown', usage: result.usage }; }
    }
    // A failed OOM/cgroup proof withholds the answer but keeps the real usage.
    if (!memoryOk && (result!.state === 'evidence' || result!.state === 'insufficient')) result = { state: 'unknown', usage: result!.usage };
    return result!;
  }

  /** Restart recovery: remove a lease's container, prove removal, then free its slot. Returns false if removal is unproven (slot retained). */
  async function reclaimLease(lease: string): Promise<boolean> {
    if (!/^panda-n45-[a-f0-9]{32}$/.test(lease)) throw Error('invalid_lease');
    const ids = (await docker(['ps', '-aq', '--no-trunc', '--filter', 'name=^/' + lease + '$'])).split('\n').filter(Boolean);
    for (const id of ids) {
      if (!/^[a-f0-9]{64}$/.test(id)) return false;
      const inspect = JSON.parse(await docker(['inspect', id]))[0]; // never remove a container that is not exactly this lease's
      if (inspect?.Image !== researchImageId || inspect?.Config?.Labels?.['panda.native.lease'] !== lease) return false;
      await docker(['rm', '-f', id]);
    }
    if (await docker(['ps', '-aq', '--no-trunc', '--filter', 'name=^/' + lease + '$']) !== '') return false;
    await releaseStaleDockerHostSlot(slotDir, lease); return true;
  }
  /** Leases currently holding a slot file, read from the slot itself (restart recovery for terminal requests whose removal failed). */
  async function heldLeases(): Promise<string[]> {
    const out: string[] = [];
    for (const name of await fs.readdir(slotDir).catch(() => [] as string[])) {
      if (!/^slot-[0-9]+$/.test(name)) continue;
      const value = await fs.readFile(path.join(slotDir, name), 'utf8').catch(() => '');
      if (/^panda-n45-[a-f0-9]{32}\n$/.test(value)) out.push(value.trim());
    }
    return out;
  }
  return Object.freeze({ run, reclaimLease, heldLeases });
}
export type ResearchTurnRunner = ReturnType<typeof createResearchTurnRunner>;
