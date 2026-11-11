// Phase D2 host research service handler (phase-d-plan.md D2 R1). Transport-free: the HTTPS entrypoint feeds it requests.
// Routes (envelope {dispatch,mac[,prompt]} in the JSON body, or base64 JSON in x-panda-research-envelope for GET):
//   POST /v1/research/turns                      action turn   -> NDJSON progress lines then one {type:'result',payload,answer?,mac}
//   GET|POST /v1/research/turns/{id}[/status]    action status -> signed result, or {type:'status',state:'running'}
//   POST /v1/research/turns/{id}/cancel          action cancel -> signed result (never evidence)
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalResearchJSON } from '../opencode/research-provider-gateway.ts';
import { verifyDispatch, signResult, researchRunId, researchPromptHash, type DispatchFields, type ResultFields, type ResearchFailure, type ResearchUsage } from './research-envelopes.ts';
import { ResearchRunFailure, emptyUsage, type RunnerInput, type RunnerHooks, type RunnerResult, type ResearchAnswerOut } from './research-turn-runner.ts';

export const researchBodyMax = 16384, researchPromptMax = 8000, researchRetentionMs = 7 * 24 * 3600 * 1000, researchResultTtlSeconds = 120;
export type ResearchServiceKeys = { dispatchKey: Buffer; resultKey: Buffer; serviceToken: Buffer };
export type ResearchRunnerLike = { run(input: RunnerInput, hooks?: RunnerHooks): Promise<RunnerResult>; reclaimLease?(lease: string): Promise<boolean>; heldLeases?(): Promise<string[]> };
export type ServiceRequest = { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: Buffer };
export type ServiceResponse = { status: number; json: unknown } | { status: number; contentType: 'application/x-ndjson'; stream: AsyncIterable<string> };
type Stored = { promptHash: string; runId: string; profile: DispatchFields['profile']; modelId: string; createdAt: number; lease?: string;
  state: 'running' | 'evidence' | 'insufficient' | 'unknown' | 'failed'; reason?: ResearchFailure; answer?: ResearchAnswerOut; usage?: ResearchUsage };
type Entry = { controller: AbortController; subs: Set<Channel>; done: Promise<void> };
type Channel = ReturnType<typeof channel>;

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const keyOf = (f: { subjectHash: string; chatId: string; requestId: string }) => sha(f.subjectHash + '\n' + f.chatId + '\n' + f.requestId);
const terminal = (s: Stored['state']) => s !== 'running';
const err = (status: number, error: string): ServiceResponse => ({ status, json: { error } });
const capUsage = (u: ResearchUsage | undefined): ResearchUsage => ({ calls: Math.min(u?.calls ?? 0, 6), inputTokens: Math.min(u?.inputTokens ?? 0, 192000), outputTokens: Math.min(u?.outputTokens ?? 0, 4200), costNanoUsd: Math.min(u?.costNanoUsd ?? 0, 1000000000) });
function channel() {
  const lines: string[] = []; let wake: (() => void) | null = null, closed = false;
  return { push(line: string) { lines.push(line); wake?.(); }, close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() { for (;;) { while (lines.length) yield lines.shift()!; if (closed) return; await new Promise<void>(r => { wake = r; }); wake = null; } } };
}
// The bearer token is the base64 form of the 32-byte service token; both sides are hashed so lengths never leak through the compare.
const sameToken = (supplied: string, expected: Buffer) => timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(expected.toString('base64')).digest());
/** Loopback or private IPv4 only (RFC1918, link-local); never a wildcard or a public address. */
export function isPrivateBindAddress(address: unknown): boolean {
  if (address === '::1') return true;
  const m = typeof address === 'string' ? /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address) : null; if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number); if ([a, b, c, d].some(n => n > 255)) return false;
  return a === 127 || a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 169 && b === 254;
}

export function createResearchServiceHandler(options: { root?: string; keys: ResearchServiceKeys; runner: ResearchRunnerLike; now?: () => number; cancelWaitMs?: number; log?: (message: string) => void }) {
  const root = options.root ?? '/opt/panda-research', dir = path.join(root, 'requests'), now = options.now ?? Date.now, seconds = () => Math.floor(now() / 1000), { keys, runner } = options;
  const active = new Map<string, Entry>(), cancelWait = options.cancelWaitMs ?? 30000, log = options.log ?? ((m: string) => console.error(m));

  async function ensureDir() {
    try { await fs.mkdir(dir, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    const st = await fs.lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink() || process.platform !== 'win32' && ((st.mode & 0o777) !== 0o700 || st.uid !== process.getuid?.())) throw Error('requests_dir_denied');
  }
  const file = (key: string) => path.join(dir, key + '.json');
  async function read(key: string): Promise<Stored | null> {
    try {
      const st = await fs.lstat(file(key)); if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > 65536) throw Error('request_file_denied');
      return JSON.parse(await fs.readFile(file(key), 'utf8'));
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  async function create(key: string, value: Stored): Promise<boolean> {
    let h; try { h = await fs.open(file(key), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false; throw e; }
    try { await h.writeFile(JSON.stringify(value)); await h.sync(); } finally { await h.close(); }
    return true;
  }
  async function update(key: string, value: Stored) {
    const tmp = file(key) + '.' + randomBytes(8).toString('hex') + '.tmp', h = await fs.open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await h.writeFile(JSON.stringify(value)); await h.sync(); } finally { await h.close(); }
    await fs.rename(tmp, file(key));
  }
  // The stored result is unsigned; every response signs it fresh so an old file never carries an expired MAC.
  function sign(f: { subjectHash: string; chatId: string; requestId: string }, s: Stored) {
    const fields: ResultFields = { v: 1, subjectHash: f.subjectHash, chatId: f.chatId, requestId: f.requestId, runId: s.runId, profile: s.profile, modelId: s.modelId, promptHash: s.promptHash,
      state: s.state as ResultFields['state'], ...(s.state === 'failed' ? { reason: s.reason ?? 'invalid' } : {}), ...(s.answer ? { answerHash: sha(canonicalResearchJSON(s.answer)) } : {}),
      usage: s.usage ?? emptyUsage(), exp: seconds() + researchResultTtlSeconds };
    return { type: 'result', payload: fields, ...(s.answer ? { answer: s.answer } : {}), mac: signResult(keys.resultKey, fields, seconds()) };
  }
  // A result that cannot be signed (out-of-range usage) degrades to unknown with capped usage, never to a permanent 500.
  const degrade = (s: Stored): Stored => ({ ...s, state: 'unknown', reason: undefined, answer: undefined, usage: capUsage(s.usage) });
  function safeSign(f: { subjectHash: string; chatId: string; requestId: string }, s: Stored) {
    try { return sign(f, s); } catch { try { return sign(f, degrade(s)); } catch { return sign(f, { ...degrade(s), usage: emptyUsage() }); } }
  }
  // A running file with no live runner (crash, or a failed final persist) is reported unknown, never running forever.
  const effective = (key: string, s: Stored): Stored => s.state === 'running' && !active.has(key) ? degrade(s) : s;
  const line = (v: unknown) => JSON.stringify(v) + '\n';
  const streamOf = (f: DispatchFields, s: Stored): ServiceResponse => { const c = channel(); c.push(line(safeSign(f, s))); c.close(); return { status: 200, contentType: 'application/x-ndjson', stream: c }; };

  // Registered in `active` synchronously, before the O_EXCL create is awaited, so an identical concurrent request always finds and attaches to it.
  const register = (key: string, first: Channel): Entry => { const entry: Entry = { controller: new AbortController(), subs: new Set([first]), done: Promise.resolve() }; active.set(key, entry); return entry; };
  function start(key: string, f: DispatchFields, prompt: string, stored: Stored, entry: Entry): Entry {
    const { controller, subs } = entry, emit = (l: string) => { for (const c of subs) c.push(l); };
    entry.done = (async () => {
      let outcome: RunnerResult;
      try {
        outcome = await runner.run({ subjectHash: f.subjectHash, chatId: f.chatId, runId: stored.runId, profile: f.profile, prompt }, {
          signal: controller.signal, onProgress: stage => emit(line({ type: 'progress', stage })),
          onLease: async lease => { stored = { ...stored, lease }; await update(key, stored); } });
      } catch (error) { outcome = error instanceof ResearchRunFailure ? { state: 'failed', reason: error.reason, usage: emptyUsage() } : { state: 'unknown', usage: emptyUsage() }; }
      stored = { ...stored, state: outcome.state, ...(outcome.reason ? { reason: outcome.reason } : {}), ...(outcome.answer ? { answer: outcome.answer } : {}), usage: outcome.usage };
      try { sign(f, stored); } catch { stored = degrade(stored); }
      // Persist before stream. One retry; if both fail the stream still says unknown and the file's stale `running`
      // is reported unknown by status (no live runner) and settled by the next reconcile.
      let persisted = false;
      for (let attempt = 0; attempt < 2 && !persisted; attempt++) { try { await update(key, stored); persisted = true; } catch { /* retry once */ } }
      if (!persisted) stored = degrade(stored);
      active.delete(key); emit(line(safeSign(f, stored))); for (const c of subs) c.close(); subs.clear();
    })().catch(() => { active.delete(key); for (const c of subs) c.close(); });
    return entry;
  }

  function envelope(r: ServiceRequest): { dispatch: unknown; mac: unknown; prompt?: unknown } | null {
    try {
      const raw = r.body.length ? r.body.toString('utf8') : Buffer.from(String(r.headers['x-panda-research-envelope'] ?? ''), 'base64').toString('utf8');
      const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch { return null; }
  }

  // Same promptHash/profile: replay the stored result or attach to the live run. Different: 409.
  function replay(key: string, f: DispatchFields, existing: Stored): ServiceResponse {
    if (existing.promptHash !== f.promptHash || existing.profile !== f.profile) return err(409, 'conflict');
    if (existing.state !== 'running') return streamOf(f, existing);
    const entry = active.get(key); if (!entry) return streamOf(f, effective(key, existing));
    const c = channel(); entry.subs.add(c); return { status: 200, contentType: 'application/x-ndjson', stream: c };
  }

  async function handle(r: ServiceRequest): Promise<ServiceResponse> {
    const auth = String(r.headers.authorization ?? '');
    if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), keys.serviceToken)) return err(401, 'unauthorized');
    if (r.body.length > researchBodyMax) return err(413, 'body_too_large');
    const url = new URL(r.path, 'http://x'), m = /^\/v1\/research\/turns(?:\/([0-9a-f-]{36})(?:\/(status|cancel))?)?$/.exec(url.pathname);
    let route: 'turn' | 'status' | 'cancel' | null = null;
    if (m && r.method === 'POST' && !m[1]) route = 'turn'; else if (m && m[1] && ((r.method === 'GET' && !m[2]) || (r.method === 'POST' && m[2] === 'status'))) route = 'status'; else if (m && m[1] && r.method === 'POST' && m[2] === 'cancel') route = 'cancel';
    if (!route) return err(404, 'not_found');
    const env = envelope(r); if (!env) return err(400, 'invalid_request');
    if (!verifyDispatch(keys.dispatchKey, env.dispatch, env.mac, seconds())) return err(403, 'invalid_envelope');
    const f = env.dispatch as DispatchFields;
    if (f.action !== route || (m![1] && m![1] !== f.requestId)) return err(403, 'action_mismatch');
    const key = keyOf(f);
    try {
      await ensureDir();
      if (route === 'turn') {
        const prompt = env.prompt;
        if (typeof prompt !== 'string' || !prompt.trim() || !prompt.isWellFormed() || Buffer.byteLength(prompt, 'utf8') > researchPromptMax || researchPromptHash(prompt) !== f.promptHash) return err(400, 'invalid_prompt');
        let existing = await read(key);
        if (!existing && active.has(key)) existing = { promptHash: f.promptHash, profile: f.profile, state: 'running' } as Stored; // a sibling request in this process is mid-start
        if (!existing) {
          const stored: Stored = { promptHash: f.promptHash, runId: researchRunId(f.subjectHash, f.chatId, f.requestId), profile: f.profile, modelId: f.modelId, createdAt: now(), state: 'running' };
          if (active.size > 0) { // one turn at a time per service; same signed busy result as the slot check
            const busy: Stored = { ...stored, state: 'failed', reason: 'busy', usage: emptyUsage() };
            if (await create(key, busy)) return streamOf(f, busy);
          } else {
            const c = channel(), entry = register(key, c);
            if (await create(key, stored)) { start(key, f, prompt, stored, entry); return { status: 200, contentType: 'application/x-ndjson', stream: c }; }
            active.delete(key); for (const sub of entry.subs) sub.close(); // lost to another process: attached streams end empty and clients use status
          }
          existing = await read(key); // lost the O_EXCL race to an identical request: replay or attach, not 409
          if (!existing) return err(500, 'service_error');
        }
        return replay(key, f, existing);
      }
      const existing = await read(key); if (!existing) return err(404, 'not_found');
      if (existing.promptHash !== f.promptHash) return err(409, 'conflict');
      if (route === 'cancel') {
        const entry = active.get(key);
        if (entry) { entry.controller.abort(); await Promise.race([entry.done, new Promise(r2 => setTimeout(r2, cancelWait))]); }
        let after = await read(key); if (!after) return err(404, 'not_found');
        if (entry && (after.state === 'evidence' || after.state === 'insufficient')) after = degrade(after); // a finish that raced the cancel is never reported as an answer; the stored file keeps its usage
        after = effective(key, after);
        return after.state !== 'running' ? { status: 200, json: safeSign(f, after) } : { status: 202, json: { type: 'status', state: 'running' } };
      }
      const view = effective(key, existing);
      return view.state !== 'running' ? { status: 200, json: safeSign(f, view) } : { status: 200, json: { type: 'status', state: 'running' } };
    } catch { return err(500, 'service_error'); }
  }

  /** On start: reclaim every lease still holding a slot (any request state), running -> unknown, 7-day retention, stale .tmp cleanup. Unreadable files are skipped with a fixed log line. */
  async function reconcile() {
    await ensureDir(); let interrupted = 0, deleted = 0, skipped = 0, reclaimed = 0;
    const held = new Set(await runner.heldLeases?.() ?? []), reclaim = async (lease: string) => {
      if (!runner.reclaimLease) return false;
      try { const ok = await runner.reclaimLease(lease); if (ok) reclaimed++; return ok; } catch { return false; } // the slot stays held until removal is proven
    };
    for (const name of await fs.readdir(dir)) {
      const full = path.join(dir, name);
      if (name.endsWith('.tmp')) { await fs.unlink(full).catch(() => {}); continue; }
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const key = name.slice(0, -5); let s: Stored | null;
      try { s = await read(key); } catch { s = null; log('research-service: skipped an unreadable request file'); skipped++; continue; }
      if (!s || typeof s.state !== 'string' || typeof s.createdAt !== 'number') { log('research-service: skipped an invalid request file'); skipped++; continue; }
      const lease = typeof s.lease === 'string' && /^panda-n45-[a-f0-9]{32}$/.test(s.lease) ? s.lease : undefined;
      // Reclaim before any deletion: a stale terminal file must not hide a slot whose container removal failed.
      const freed = lease && (s.state === 'running' || held.has(lease)) ? await reclaim(lease) : true;
      if (now() - s.createdAt > researchRetentionMs && terminal(s.state) && freed) { await fs.unlink(full); deleted++; continue; }
      if (s.state !== 'running') continue;
      await update(key, { ...s, state: 'unknown', usage: s.usage ?? emptyUsage() }); interrupted++;
    }
    return { interrupted, deleted, skipped, reclaimed };
  }
  return Object.freeze({ handle, reconcile, activeCount: () => active.size, idle: () => Promise.all([...active.values()].map(e => e.done)).then(() => undefined) });
}
