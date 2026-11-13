import 'server-only';
// Phase D3 app -> host research client: SigV4 (Vercel OIDC caller role) to the separate research API, an app-signed
// dispatch envelope, and a host-signed result that must match what was dispatched. Any transport, parse or
// verification failure is `unknown`; nothing here retries a turn. The existing hosted signer/allowlists are unchanged.
import { createHash } from 'node:crypto';
import { citationImages } from '../search/citation-image.ts';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { canonicalResearchJSON } from '../opencode/research-provider-gateway.ts';
import { researchChatProfiles, researchSubjectHash, researchRunId, researchPromptHash, signDispatch, verifyResult,
  type ResearchChatProfile, type ResearchFailure, type ResearchUsage, type DispatchFields } from './research-envelopes.ts';

type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: Date };
export type ResearchCitation = { id: 'S1' | 'S2'; title: string; sourceUrl: string; capturedAt: string; quote: string; sectionPath: []; images?: { url: string; description: string }[] };
export type ResearchChatAnswer = { outcome: 'evidence' | 'insufficient'; text: string; citations: ResearchCitation[] };
export type ResearchOutcome =
  | { state: 'evidence' | 'insufficient'; answer: ResearchChatAnswer; answerHash: string; usage: ResearchUsage }
  | { state: 'failed'; reason: ResearchFailure; usage: ResearchUsage }
  | { state: 'unknown' | 'running' | 'conflict' | 'not_found' };
export type ResearchTurnInput = { subject: string; chatId: string; requestId: string; profile: ResearchChatProfile; prompt: string };
type Fetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<Response>;
type Options = { endpoint: string; roleArn: string; dispatchKey: Buffer; resultKey: Buffer; credentials?: () => Promise<Credentials>; fetch?: Fetch; now?: () => number;
  sign?: (input: { url: string; headers: Record<string, string>; body: string }) => Promise<Record<string, string>> };

export const researchProgressStages = ['searching_web', 'checking_citations'] as const;
export type ResearchProgress = typeof researchProgressStages[number];
const unknown = Object.freeze({ state: 'unknown' }) as ResearchOutcome;
const lineMax = 65536, streamMax = 262144, jsonMax = 65536, bodyMax = 16384, promptMax = 8000;
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const capturedAt = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$/;
const citationKeys = ['id', 'title', 'sourceUrl', 'capturedAt', 'quote', 'sectionPath'];
const trimmedLength = (s: string) => s.trim().length; // shortcut: JS trim vs SQL btrim(' ') differ on tabs/newlines; the D1 RPC rechecks, so a mismatch is rejected there, never saved

/** Mirrors D1 `panda_agent_research_answer_valid` so a malformed host answer is never sent to `receipt`. */
export function validResearchChatAnswer(a: unknown): a is ResearchChatAnswer {
  if (!plain(a) || !exactKeys(a, ['outcome', 'text', 'citations']) || typeof a.text !== 'string' || trimmedLength(a.text) < 1 || a.text.length > 8000
    || !Array.isArray(a.citations) || Buffer.byteLength(JSON.stringify(a)) > 24000) return false;
  const n = a.citations.length;
  if (!(a.outcome === 'evidence' && n >= 1 && n <= 2) && !(a.outcome === 'insufficient' && n === 0)) return false;
  return a.citations.every((c: unknown, i: number) => plain(c) && exactKeys(c, Object.hasOwn(c, 'images') ? [...citationKeys, 'images'] : citationKeys) && c.id === 'S' + (i + 1)
    && typeof c.title === 'string' && trimmedLength(c.title) >= 1 && c.title.length <= 300
    && typeof c.sourceUrl === 'string' && c.sourceUrl.length <= 2048 && /^https?:\/\/\S+$/.test(c.sourceUrl)
    && typeof c.capturedAt === 'string' && capturedAt.test(c.capturedAt)
    && typeof c.quote === 'string' && trimmedLength(c.quote) >= 1 && c.quote.length <= 180
    && Array.isArray(c.sectionPath) && c.sectionPath.length === 0
    && (!Object.hasOwn(c, 'images') || Array.isArray(c.images) && c.images.length > 0 && JSON.stringify(citationImages(c.sourceUrl, c.images)) === JSON.stringify(c.images)));
}

function createSigner(endpoint: URL, roleArn: string, credentials?: () => Promise<Credentials>) {
  if (!/^arn:aws:iam::\d{12}:role\/[A-Za-z0-9+=,.@_-]{1,64}$/.test(roleArn)) throw Error('Research gateway unavailable');
  const provider = credentials ?? awsCredentialsProvider({ roleArn, durationSeconds: 900, clientConfig: { region: 'ap-south-1' } });
  const signer = new SignatureV4({ service: 'execute-api', region: 'ap-south-1', sha256: Sha256, credentials: async () => {
    const c = await provider();
    if (!c.accessKeyId || !c.secretAccessKey || !c.sessionToken || !(c.expiration instanceof Date) || !Number.isFinite(c.expiration.valueOf()) || c.expiration.valueOf() <= Date.now() + 5000) throw Error('Research gateway unavailable');
    return c;
  } });
  return async (input: { url: string; headers: Record<string, string>; body: string }) => {
    const url = new URL(input.url);
    if (url.origin !== endpoint.origin || !/^\/research\/v1\/research\/turns(?:\/[0-9a-f-]{36}\/(?:status|cancel))?$/.test(url.pathname) || url.search || url.hash
      || Buffer.byteLength(input.body) > bodyMax || Object.keys(input.headers).join(',') !== 'content-type,accept') throw Error('Research gateway unavailable');
    const request = new HttpRequest({ protocol: 'https:', hostname: url.hostname, method: 'POST', path: url.pathname, headers: { ...input.headers, host: url.hostname }, body: input.body });
    return (await signer.sign(request)).headers as Record<string, string>;
  };
}

export function createResearchGatewayClient(options: Options) {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9]{10}\.execute-api\.ap-south-1\.amazonaws\.com$/.test(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.search || endpoint.hash
    || endpoint.pathname.replace(/\/$/, '') !== '/research' || !Buffer.isBuffer(options.dispatchKey) || options.dispatchKey.length !== 32 || !Buffer.isBuffer(options.resultKey) || options.resultKey.length !== 32
    || options.dispatchKey.equals(options.resultKey)) throw Error('Research gateway unavailable');
  const sign = options.sign ?? createSigner(endpoint, options.roleArn, options.credentials);
  const doFetch: Fetch = options.fetch ?? ((url, init) => fetch(url, { ...init, cache: 'no-store', redirect: 'error' }));
  const seconds = () => Math.floor((options.now ?? Date.now)() / 1000);

  function dispatch(action: DispatchFields['action'], input: ResearchTurnInput): DispatchFields {
    if (!Object.hasOwn(researchChatProfiles, input.profile) || !uuid(input.chatId) || !uuid(input.requestId) || typeof input.subject !== 'string' || !input.subject
      || typeof input.prompt !== 'string' || !input.prompt.trim() || !input.prompt.isWellFormed() || Buffer.byteLength(input.prompt, 'utf8') > promptMax) throw Error('Research request invalid');
    return { v: 1, action, subjectHash: researchSubjectHash(input.subject), chatId: input.chatId, requestId: input.requestId, profile: input.profile,
      modelId: researchChatProfiles[input.profile], promptHash: researchPromptHash(input.prompt), exp: seconds() + 50 };
  }
  async function post(path: string, accept: string, body: string, signal?: AbortSignal) {
    const url = endpoint.origin + '/research' + path, headers = { 'content-type': 'application/json', accept };
    return doFetch(url, { method: 'POST', headers: { ...headers, ...(await sign({ url, headers, body })) }, body, signal });
  }
  /** A signed result line/body: MAC, every dispatched field, runId, and for answers the hash and D1 shape. */
  function accept(d: DispatchFields, line: unknown): ResearchOutcome {
    if (!plain(line) || !verifyResult(options.resultKey, line.payload, line.mac, seconds())) return unknown;
    const p = line.payload as Record<string, any>;
    for (const k of ['subjectHash', 'chatId', 'requestId', 'profile', 'modelId', 'promptHash'] as const) if (p[k] !== d[k]) return unknown;
    if (p.runId !== researchRunId(d.subjectHash, d.chatId, d.requestId)) return unknown;
    if (p.state === 'evidence' || p.state === 'insufficient') {
      if (!exactKeys(line, ['type', 'payload', 'answer', 'mac']) || line.type !== 'result' || !validResearchChatAnswer(line.answer) || line.answer.outcome !== p.state
        || sha(canonicalResearchJSON(line.answer)) !== p.answerHash) return unknown;
      return { state: p.state, answer: line.answer, answerHash: p.answerHash, usage: p.usage };
    }
    if (!exactKeys(line, ['type', 'payload', 'mac']) || line.type !== 'result') return unknown;
    return p.state === 'failed' ? { state: 'failed', reason: p.reason, usage: p.usage } : unknown;
  }
  async function smallJson(res: Response): Promise<unknown> {
    if (!res.body) return null; const reader = res.body.getReader(), parts: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > jsonMax) { await reader.cancel(); return null; } parts.push(value); }
    try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return null; }
  }
  function statusOutcome(status: number, body: unknown): ResearchOutcome | null {
    if (status === 409 && plain(body) && body.error === 'conflict') return { state: 'conflict' };
    if (status === 404 && plain(body) && body.error === 'not_found') return { state: 'not_found' };
    if ((status === 200 || status === 202) && plain(body) && exactKeys(body, ['type', 'state']) && body.type === 'status' && body.state === 'running') return { state: 'running' }; // unsigned: never terminal
    return null;
  }

  async function turn(input: ResearchTurnInput, hooks: { onProgress?(stage: ResearchProgress): void; signal?: AbortSignal } = {}): Promise<ResearchOutcome> {
    const d = dispatch('turn', input), body = JSON.stringify({ dispatch: d, mac: signDispatch(options.dispatchKey, d, seconds()), prompt: input.prompt });
    if (Buffer.byteLength(body) > bodyMax) throw Error('Research request invalid'); // JSON escaping can grow an 8,000 B prompt past the body limit: refused before dispatch
    try {
      const res = await post('/v1/research/turns', 'application/x-ndjson', body, hooks.signal);
      if (res.status !== 200) return statusOutcome(res.status, await smallJson(res)) ?? unknown;
      if (!/^application\/x-ndjson(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '') || !res.body) return unknown;
      const reader = res.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let buffer = '', total = 0, result: ResearchOutcome | null = null;
      const take = (text: string): boolean => {
        let value: unknown; try { value = JSON.parse(text); } catch { return false; }
        if (plain(value) && value.type === 'progress' && exactKeys(value, ['type', 'stage'])) {
          if (!(researchProgressStages as readonly string[]).includes(value.stage) || result) return false;
          try { hooks.onProgress?.(value.stage); } catch { /* a UI callback never changes the outcome */ } return true;
        }
        if (result) return false; // exactly one result line
        result = accept(d, value); return result.state !== 'unknown';
      };
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength; if (total > streamMax) { await reader.cancel(); return unknown; }
        buffer += decoder.decode(value, { stream: true });
        let nl; while ((nl = buffer.indexOf('\n')) >= 0) { const text = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); if (text && !take(text)) { await reader.cancel(); return unknown; } }
        if (buffer.length > lineMax) { await reader.cancel(); return unknown; }
      }
      buffer += decoder.decode(); if (buffer && !take(buffer)) return unknown;
      return result ?? unknown;
    } catch { return unknown; }
  }
  async function lookup(action: 'status' | 'cancel', input: ResearchTurnInput, signal?: AbortSignal): Promise<ResearchOutcome> {
    const d = dispatch(action, input), body = JSON.stringify({ dispatch: d, mac: signDispatch(options.dispatchKey, d, seconds()) });
    try {
      const res = await post(`/v1/research/turns/${d.requestId}/${action}`, 'application/json', body, signal), value = await smallJson(res);
      if (res.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(res.headers.get('content-type') ?? '')) return statusOutcome(res.status, value) ?? unknown;
      return statusOutcome(200, value) ?? (plain(value) ? accept(d, { type: 'result', ...value }) : unknown);
    } catch { return unknown; }
  }
  return { turn, status: (input: ResearchTurnInput, signal?: AbortSignal) => lookup('status', input, signal), cancel: (input: ResearchTurnInput, signal?: AbortSignal) => lookup('cancel', input, signal) };
}
