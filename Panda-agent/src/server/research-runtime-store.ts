import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { researchJSON, type ResearchValue } from '../opencode/research-values.ts';

export type ResearchBinding = { binding: string; owner: string; sessionID: string; profileHash: string; imageId: string; created: number };
export type ResearchRunReceipt = { binding: string; owner: string; runID: string; messageID: string; promptHash: string; sourceRevision: string; generation: string };
export type ResearchOperation = { kind: 'primary' | 'tool'; key: string; requestHash: string };
export type ResearchAssociation = { assistantMessageID: string; callsDigest: string };
export type ResearchAttempt = ResearchOperation & { state: 'claimed' | 'sent' | 'settled'; grant?: string; resultHash?: string; association?: ResearchAssociation };
export type ResearchRunRecord = { receipt: ResearchRunReceipt; state: 'admitted' | 'prompt_claimed' | 'accepted' | 'interrupted' | 'finished'; operations: ResearchAttempt[]; cancelled?: 'cancelled' | 'source_retired'; outcome?: 'succeeded' | 'failed' | 'interrupted' };
export type ResearchOperationObservation = { state: 'dispatch' | 'cached' | 'unknown' | 'conflict'; result?: ResearchValue };
export type ResearchNativeTerminal = { sessionID: string; messageID: string; promptHash: string; outcome: 'succeeded' | 'failed' | 'interrupted'; active: false };
export type ResearchNativeVerifier = () => Promise<ResearchNativeTerminal | null>;
type Current = { generation: string | null; create: 'new' | 'claimed' | 'created'; activeRun: string | null };
type ResultRecord = { receipt: ResearchRunReceipt; operation: ResearchOperation; grant: string; resultHash: string; result: ResearchValue };
const HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const native = (prefix: string, value: unknown) => typeof value === 'string' && new RegExp('^' + prefix + '_[a-f0-9]{12}[A-Za-z0-9]{14}$').test(value);
const hex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);
const valid = (value: unknown, keys: string[]) => researchJSON(value, 4096) && !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.sort().join(',');
const bindingValid = (b: ResearchBinding) => valid(b, ['binding', 'owner', 'sessionID', 'profileHash', 'imageId', 'created']) && hex(b.binding) && hex(b.owner) && hex(b.profileHash) && native('ses', b.sessionID) && typeof b.imageId === 'string' && /^sha256:[0-9a-f]{64}$/.test(b.imageId) && Number.isSafeInteger(b.created) && b.created >= 0;
const receiptValid = (r: ResearchRunReceipt) => valid(r, ['binding', 'owner', 'runID', 'messageID', 'promptHash', 'sourceRevision', 'generation']) && hex(r.binding) && hex(r.owner) && hex(r.generation) && hex(r.promptHash) && hex(r.sourceRevision) && typeof r.runID === 'string' && UUID.test(r.runID) && native('msg', r.messageID);
const operationValid = (o: ResearchOperation) => valid(o, ['kind', 'key', 'requestHash']) && (o.kind === 'primary' || o.kind === 'tool') && hex(o.key) && hex(o.requestHash);
const associationValid = (a: ResearchAssociation) => valid(a, ['assistantMessageID', 'callsDigest']) && native('msg', a.assistantMessageID) && hex(a.callsDigest);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function canonical(value: ResearchValue): string {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
 return JSON.stringify(value);
}
export function hashResearchJSON(value: unknown): string {
 if (!researchJSON(value, 2097152, 24, 4096)) throw Error('Invalid bounded research JSON');
 return createHash('sha256').update(canonical(value)).digest('hex');
}
const equal = (a: unknown, b: unknown) => hashResearchJSON(a) === hashResearchJSON(b);
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const queues = new Map<string, Promise<unknown>>();

/** A host-owned execution fence. Callers authenticate before using this private authority. */
export async function openResearchRuntimeStore(root: string, options: { isCurrent?: (receipt: ResearchRunReceipt) => boolean | Promise<boolean> } = {}) {
 if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) throw Error('Research root must be absolute and resolved');
 const uid = process.getuid?.();
 async function check(file: string, directory: boolean, expectedUID = uid) {
  const stat = await lstat(file);
  if (stat.isSymbolicLink()) throw Error('Research symlink denied');
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) throw Error('Unexpected research layout');
  if (process.platform !== 'win32' && ((stat.mode & 0o777) !== (directory ? 0o700 : 0o600) || stat.uid !== expectedUID || expectedUID === 10001 && stat.gid !== 10001)) throw Error('Research ownership/private mode denied');
  return stat;
 }
 async function ancestors() {
  let part = path.parse(root).root;
  for (const component of path.relative(part, root).split(path.sep).filter(Boolean)) {
   part = path.join(part, component); const stat = await lstat(part);
   if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Research symlink ancestor denied');
  }
  await check(root, true);
 }
 async function directory(file: string) {
  try { await mkdir(file, { mode: 0o700 }); await syncDirectory(path.dirname(file)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  await check(file, true);
 }
 async function syncDirectory(file: string) {
  if (process.platform === 'win32') return;
  const handle = await open(file, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
 }
 async function layout() {
  await ancestors();
  for (const name of await readdir(root)) if (!['bindings', 'code'].includes(name)) throw Error('Unexpected research root layout');
  await check(path.join(root, 'bindings'), true);
  if ((await readdir(root)).includes('code')) await check(path.join(root, 'code'), true);
 }
 async function read<T>(file: string, max = 262144): Promise<T | null> {
  try {
   const stat = await check(file, false); if (stat.size > max) throw Error('Research record bounds');
   const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
   try {
    const opened = await handle.stat(); if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw Error('Research record changed');
    const value: unknown = JSON.parse(await handle.readFile('utf8'));
    if (!researchJSON(value, max, 24, 4096)) throw Error('Invalid research record');
    return value as T;
   } finally { await handle.close(); }
  } catch (e) { if (absent(e)) return null; throw e; }
 }
 async function write(file: string, value: unknown, exclusive = false) {
  if (!researchJSON(value, 262144, 24, 4096)) throw Error('Research record bounds');
  const bytes = JSON.stringify(value);
  if (exclusive) {
   const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
   try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
   await syncDirectory(path.dirname(file)); return;
  }
  const temporary = file + '.' + randomBytes(16).toString('hex') + '.tmp';
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file); await syncDirectory(path.dirname(file));
 }
 async function bindingLayout(dir: string) {
  await check(dir, true);
  for (const name of await readdir(dir)) {
   if (!['binding.json', 'current.json', 'runs', 'results', 'native', '.lock'].includes(name)) throw Error('Unexpected research binding layout');
   await check(path.join(dir, name), !name.endsWith('.json'), name === 'native' ? 10001 : uid);
  }
  for (const [folder, pattern] of [['runs', /^[0-9a-f-]{36}\.json$/], ['results', /^[0-9a-f]{64}\.json$/]] as const) {
   const location = path.join(dir, folder); await check(location, true);
   for (const name of await readdir(location)) { if (!pattern.test(name)) throw Error('Unexpected research record layout'); await check(path.join(location, name), false); }
  }
 }
 async function locked<T>(id: string, action: (dir: string) => Promise<T>, creating = false): Promise<T> {
  const dir = path.join(root, 'bindings', id);
  const previous = queues.get(dir) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(async () => {
   await layout(); if (creating) await directory(dir); else await check(dir, true);
   const lock = path.join(dir, '.lock');
   try { await mkdir(lock, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw Error('Research binding lock unavailable; no stale reclamation'); throw e; }
   await syncDirectory(dir);
   try { if (!creating) await bindingLayout(dir); return await action(dir); }
   finally { await rmdir(lock); await syncDirectory(dir); }
  });
  queues.set(dir, pending);
  try { return await pending; } finally { if (queues.get(dir) === pending) queues.delete(dir); }
 }
 const runPath = (dir: string, r: ResearchRunReceipt) => path.join(dir, 'runs', r.runID + '.json');
 const resultPath = (dir: string, op: ResearchOperation) => path.join(dir, 'results', op.key + '.json');
 async function owned(dir: string, b: ResearchBinding) { const record = await read<ResearchBinding>(path.join(dir, 'binding.json')); return record && bindingValid(record) && equal(record, b) ? record : null; }
 function runValid(record: ResearchRunRecord) {
  if (!researchJSON(record, 262144, 24, 4096) || !receiptValid(record.receipt) || !['admitted', 'prompt_claimed', 'accepted', 'interrupted', 'finished'].includes(record.state) || !Array.isArray(record.operations) || record.operations.length > 64) return false;
  if (record.cancelled !== undefined && !['cancelled', 'source_retired'].includes(record.cancelled)) return false;
  if (record.state === 'finished' && !['succeeded', 'failed', 'interrupted'].includes(record.outcome ?? '')) return false;
  const keys = new Set<string>();
  return record.operations.every(a => {
   if (!a || !operationValid({ kind: a.kind, key: a.key, requestHash: a.requestHash }) || keys.has(a.key) || !['claimed', 'sent', 'settled'].includes(a.state)) return false;
   keys.add(a.key);
   return (a.state === 'claimed' ? a.grant === undefined && a.resultHash === undefined : hex(a.grant)) && (a.state === 'settled' ? hex(a.resultHash) : a.resultHash === undefined) && (a.association === undefined || a.state === 'settled' && associationValid(a.association));
  });
 }
 async function run(dir: string, r: ResearchRunReceipt) {
  const b = await read<ResearchBinding>(path.join(dir, 'binding.json'));
  if (!b || !bindingValid(b) || b.binding !== r.binding || b.owner !== r.owner) return null;
  const record = await read<ResearchRunRecord>(runPath(dir, r));
  return record && runValid(record) && equal(record.receipt, r) ? record : null;
 }
 async function currentRecord(dir: string) {
  const c = await read<Current>(path.join(dir, 'current.json'));
  if (!c || !valid(c, ['generation', 'create', 'activeRun']) || !(c.generation === null || hex(c.generation)) || !['new', 'claimed', 'created'].includes(c.create) || !(c.activeRun === null || typeof c.activeRun === 'string' && UUID.test(c.activeRun))) throw Error('Invalid research current record');
  return c;
 }
 async function eligible(dir: string, r: ResearchRunReceipt, record: ResearchRunRecord) {
  const c = await currentRecord(dir);
  if (c.generation !== r.generation || c.activeRun !== r.runID || c.create !== 'created' || record.cancelled || !['prompt_claimed', 'accepted'].includes(record.state)) return false;
  try { return options.isCurrent ? await options.isCurrent(copy(r)) === true : true; } catch { return false; }
 }
 function attempt(record: ResearchRunRecord, op: ResearchOperation) { return record.operations.find(x => x.key === op.key); }
 const sameAttempt = (a: ResearchAttempt, op: ResearchOperation) => a.kind === op.kind && a.key === op.key && a.requestHash === op.requestHash;
 async function observation(dir: string, r: ResearchRunReceipt, op: ResearchOperation, a: ResearchAttempt): Promise<ResearchOperationObservation> {
  if (!sameAttempt(a, op)) return { state: 'conflict' };
  if (a.state !== 'settled') return { state: 'unknown' };
  const result = await read<ResultRecord>(resultPath(dir, a), 2162688);
  if (!result || !equal(result.receipt, r) || !sameAttempt(a, result.operation) || result.grant !== a.grant || result.resultHash !== a.resultHash || hashResearchJSON(result.result) !== a.resultHash) throw Error('Unverified private research result');
  return { state: 'cached', result: copy(result.result) };
 }
 async function terminalize(dir: string, b: ResearchBinding, record: ResearchRunRecord, verifyNative: ResearchNativeVerifier) {
  if (!runValid(record) || !['prompt_claimed', 'accepted', 'interrupted', 'finished'].includes(record.state) || record.operations.some(a => a.state !== 'settled')) return false;
  for (const a of record.operations) if ((await observation(dir, record.receipt, a, a)).state !== 'cached') return false;
  let terminal: ResearchNativeTerminal | null;
  try { terminal = await verifyNative(); } catch { return false; }
  if (!terminal || !valid(terminal, ['sessionID', 'messageID', 'promptHash', 'outcome', 'active']) || terminal.active !== false || !['succeeded', 'failed', 'interrupted'].includes(terminal.outcome) || terminal.sessionID !== b.sessionID || terminal.messageID !== record.receipt.messageID || terminal.promptHash !== record.receipt.promptHash) return false;
  if (record.state === 'finished' && record.outcome !== terminal.outcome) return false;
  record.state = 'finished'; record.outcome = terminal.outcome;
  await write(runPath(dir, record.receipt), record);
  const c = await currentRecord(dir); c.activeRun = null; await write(path.join(dir, 'current.json'), c); return true;
 }
 await ancestors();
 for (const name of await readdir(root)) if (!['bindings', 'code'].includes(name)) throw Error('Unexpected research root layout');
 await directory(path.join(root, 'bindings')); await layout();
 return {
  async createBinding(input: ResearchBinding) {
   if (!bindingValid(input)) return { state: 'conflict' as const }; const b = copy(input);
   return locked(b.binding, async dir => {
    const existing = await read<ResearchBinding>(path.join(dir, 'binding.json'));
    if (existing) { await bindingLayout(dir); return { state: equal(existing, b) ? 'existing' as const : 'conflict' as const }; }
    if ((await readdir(dir)).some(name => name !== '.lock')) throw Error('Unexpected incomplete research layout');
    await directory(path.join(dir, 'runs')); await directory(path.join(dir, 'results'));
    await write(path.join(dir, 'binding.json'), b, true);
    await write(path.join(dir, 'current.json'), { generation: null, create: 'new', activeRun: null }, true);
    return { state: 'created' as const };
   }, true);
  },
  async startGeneration(input: ResearchBinding, expected: string | null, next: string) {
   if (!bindingValid(input) || !(expected === null || hex(expected)) || !hex(next) || next === expected) return false; const b = copy(input);
   return locked(b.binding, async dir => {
    if (!await owned(dir, b)) return false; const c = await currentRecord(dir); if (c.generation !== expected) return false;
    c.generation = next; await write(path.join(dir, 'current.json'), c);
    if (c.activeRun) { const record = await read<ResearchRunRecord>(path.join(dir, 'runs', c.activeRun + '.json')); if (record && record.state !== 'finished') { record.state = 'interrupted'; await write(runPath(dir, record.receipt), record); } }
    return true;
   });
  },
  async claimCreate(input: ResearchBinding, generation: string) {
   if (!bindingValid(input) || !hex(generation)) return { state: 'conflict' }; const b = copy(input);
   return locked(b.binding, async dir => {
    if (!await owned(dir, b)) return { state: 'conflict' }; const c = await currentRecord(dir); if (c.generation !== generation) return { state: 'conflict' };
    if (c.create !== 'new') return { state: c.create === 'created' ? 'created' : 'unknown' };
    c.create = 'claimed'; await write(path.join(dir, 'current.json'), c); return { state: 'dispatch' };
   });
  },
  async markCreated(input: ResearchBinding, generation: string, identity: { sessionID: string; profileHash: string }) {
   if (!bindingValid(input) || !hex(generation) || !valid(identity, ['sessionID', 'profileHash']) || identity.sessionID !== input.sessionID || identity.profileHash !== input.profileHash) return false; const b = copy(input);
   return locked(b.binding, async dir => { if (!await owned(dir, b)) return false; const c = await currentRecord(dir); if (c.generation !== generation || c.create === 'new') return false; c.create = 'created'; await write(path.join(dir, 'current.json'), c); return true; });
  },
  async admitRun(input: ResearchRunReceipt) {
   if (!receiptValid(input)) return { state: 'conflict' }; const r = copy(input);
   return locked(r.binding, async dir => {
    const old = await read<ResearchRunRecord>(runPath(dir, r)); if (old) return { state: equal(old.receipt, r) ? old.state : 'conflict' };
    const b = await read<ResearchBinding>(path.join(dir, 'binding.json')); const c = await currentRecord(dir);
    if (!b || b.owner !== r.owner || c.generation !== r.generation || c.create !== 'created' || c.activeRun) return { state: 'conflict' };
    try { if (options.isCurrent && await options.isCurrent(copy(r)) !== true) return { state: 'conflict' }; } catch { return { state: 'conflict' }; }
    for (const name of await readdir(path.join(dir, 'runs'))) { const prior = await read<ResearchRunRecord>(path.join(dir, 'runs', name)); if (!prior || prior.receipt.messageID === r.messageID) return { state: 'conflict' }; }
    c.activeRun = r.runID; await write(path.join(dir, 'current.json'), c);
    await write(runPath(dir, r), { receipt: r, state: 'admitted', operations: [] }, true); return { state: 'admitted' };
   });
  },
  async claimPrompt(input: ResearchRunReceipt) {
   if (!receiptValid(input)) return { state: 'conflict' }; const r = copy(input);
   return locked(r.binding, async dir => {
    const record = await run(dir, r); if (!record || record.cancelled || !['admitted', 'prompt_claimed', 'accepted'].includes(record.state)) return { state: 'conflict' };
    const c = await currentRecord(dir); if (c.generation !== r.generation || c.activeRun !== r.runID) return { state: 'conflict' };
    try { if (options.isCurrent && await options.isCurrent(copy(r)) !== true) return { state: 'conflict' }; } catch { return { state: 'conflict' }; }
    if (record.state !== 'admitted') return { state: record.state === 'accepted' ? 'accepted' : 'unknown' };
    record.state = 'prompt_claimed'; await write(runPath(dir, r), record); return { state: 'dispatch' };
   });
  },
  async markPromptAccepted(input: ResearchRunReceipt) {
   if (!receiptValid(input)) return false; const r = copy(input);
   return locked(r.binding, async dir => { const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return false; record.state = 'accepted'; await write(runPath(dir, r), record); return true; });
  },
  async claimOperation(input: ResearchRunReceipt, operation: ResearchOperation): Promise<ResearchOperationObservation> {
   if (!receiptValid(input) || !operationValid(operation)) return { state: 'conflict' }; const r = copy(input), op = copy(operation);
   return locked(r.binding, async dir => {
    const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return { state: 'conflict' };
    const digest = op.kind === 'primary' ? record.operations.find(a => a.kind === 'primary' && a.requestHash === op.requestHash) : undefined;
    if (digest) return observation(dir, r, digest, digest);
    const exact = attempt(record, op);
    if (exact) return observation(dir, r, op, exact);
    if (record.operations.some(a => a.state !== 'settled')) return { state: 'unknown' };
    if (record.operations.length >= 64 || await read(resultPath(dir, op), 2162688)) return { state: 'conflict' };
    record.operations.push({ ...op, state: 'claimed' }); await write(runPath(dir, r), record); return { state: 'dispatch' };
   });
  },
  async markSending(input: ResearchRunReceipt, operation: ResearchOperation) {
   if (!receiptValid(input) || !operationValid(operation)) return null; const r = copy(input), op = copy(operation);
   return locked(r.binding, async dir => {
    const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return null; const a = attempt(record, op);
    if (!a || !sameAttempt(a, op) || a.state !== 'claimed') return null;
    a.state = 'sent'; a.grant = randomBytes(32).toString('hex'); await write(runPath(dir, r), record); return { grant: a.grant };
   });
  },
  async settleOperation(input: ResearchRunReceipt, operation: ResearchOperation, grant: string, result: unknown) {
   if (!receiptValid(input) || !operationValid(operation) || !hex(grant) || !researchJSON(result, 2097152, 24, 4096)) return false; const r = copy(input), op = copy(operation), value = copy(result), resultHash = hashResearchJSON(value);
   return locked(r.binding, async dir => {
    const record = await run(dir, r); if (!record) return false; const a = attempt(record, op);
    if (!a || !sameAttempt(a, op) || a.grant !== grant || !['sent', 'settled'].includes(a.state)) return false;
    if (a.state === 'settled') return a.resultHash === resultHash;
    const destination = resultPath(dir, op); const saved: ResultRecord = { receipt: r, operation: op, grant, resultHash, result: value };
    const existing = await read<ResultRecord>(destination, 2162688);
    if (existing && (!equal(existing.receipt, r) || !sameAttempt(a, existing.operation) || existing.grant !== grant || existing.resultHash !== resultHash || hashResearchJSON(existing.result) !== resultHash)) return false;
    if (!existing) {
     const temporary = destination + '.' + randomBytes(16).toString('hex') + '.tmp';
     const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
     try { await handle.writeFile(JSON.stringify(saved)); await handle.sync(); } finally { await handle.close(); }
     await rename(temporary, destination); await syncDirectory(path.dirname(destination));
    }
    a.state = 'settled'; a.resultHash = resultHash; await write(runPath(dir, r), record); return true;
   });
  },
  async recoverOperation(input: ResearchRunReceipt, operation: ResearchOperation): Promise<ResearchOperationObservation> {
   if (!receiptValid(input) || !operationValid(operation)) return { state: 'conflict' }; const r = copy(input), op = copy(operation);
   return locked(r.binding, async dir => { const record = await run(dir, r); const a = record && attempt(record, op); return a ? observation(dir, r, op, a) : { state: 'conflict' }; });
  },
  async associateOperation(input: ResearchRunReceipt, operation: ResearchOperation, association: ResearchAssociation) {
   if (!receiptValid(input) || !operationValid(operation) || !associationValid(association)) return false; const r = copy(input), op = copy(operation), value = copy(association);
   return locked(r.binding, async dir => { const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return false; const a = attempt(record, op); if (!a || !sameAttempt(a, op) || a.state !== 'settled') return false; if (a.association) return equal(a.association, value); a.association = value; await write(runPath(dir, r), record); return true; });
  },
  async current(input: ResearchRunReceipt) {
   if (!receiptValid(input)) return false; const r = copy(input);
   return locked(r.binding, async dir => { const record = await run(dir, r); return !!record && await eligible(dir, r, record); });
  },
  async authorizeRelease(input: ResearchRunReceipt, operation: ResearchOperation, resultHash: string) {
   if (!receiptValid(input) || !operationValid(operation) || !hex(resultHash)) return false; const r = copy(input), op = copy(operation);
   return locked(r.binding, async dir => { const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return false; const a = (op.kind === 'primary' ? record.operations.find(item => item.kind === 'primary' && item.requestHash === op.requestHash) : undefined) ?? attempt(record, op); if (!a || a.kind !== op.kind || a.requestHash !== op.requestHash || a.resultHash !== resultHash) return false; return (await observation(dir, r, a, a)).state === 'cached'; });
  },
  async cancelRun(input: ResearchRunReceipt, reason: 'cancelled' | 'source_retired') {
   if (!receiptValid(input) || !['cancelled', 'source_retired'].includes(reason)) return false; const r = copy(input);
   return locked(r.binding, async dir => { const record = await run(dir, r); if (!record || record.state === 'finished') return false; const c = await currentRecord(dir); if (c.activeRun !== r.runID || c.generation !== r.generation) return false; if (record.cancelled) return record.cancelled === reason; record.cancelled = reason; await write(runPath(dir, r), record); return true; });
  },
  async finishRun(input: ResearchRunReceipt, verifyNative: ResearchNativeVerifier) {
   if (!receiptValid(input)) return false; const r = copy(input);
   return locked(r.binding, async dir => { const record = await run(dir, r); if (!record || !await eligible(dir, r, record)) return false; const b = await read<ResearchBinding>(path.join(dir, 'binding.json')); return !!b && terminalize(dir, b, record, verifyNative); });
  },
  async reconcileTerminal(input: ResearchBinding, generation: string, verifyNative: ResearchNativeVerifier) {
   if (!bindingValid(input) || !hex(generation)) return false; const b = copy(input);
   return locked(b.binding, async dir => { if (!await owned(dir, b)) return false; const c = await currentRecord(dir); if (c.generation !== generation || !c.activeRun) return false; const record = await read<ResearchRunRecord>(path.join(dir, 'runs', c.activeRun + '.json')); return !!record && terminalize(dir, b, record, verifyNative); });
  },
  async reconcile(input: ResearchBinding) {
   if (!bindingValid(input)) return null; const b = copy(input);
   return locked(b.binding, async dir => { if (!await owned(dir, b)) return null; const c = await currentRecord(dir); return copy({ binding: b, ...c, run: c.activeRun ? await read<ResearchRunRecord>(path.join(dir, 'runs', c.activeRun + '.json')) : null }); });
  },
  async readRun(input: ResearchRunReceipt) {
   if (!receiptValid(input)) return null; const r = copy(input);
   return locked(r.binding, async dir => { const record = await run(dir, r); return record ? copy(record) : null; });
  },
 };
}
export type ResearchRuntimeStore = Awaited<ReturnType<typeof openResearchRuntimeStore>>;
