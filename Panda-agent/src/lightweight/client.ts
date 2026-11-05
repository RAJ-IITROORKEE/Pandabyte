import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

type Fragment = { handle: string; text: string };
export type SelectionMode = 'deterministic-mcu-v1';
type SelectInput = { turnId: string; productSku: string; question: string; fragments: Fragment[]; mode?:SelectionMode };
type Prepared = { body: string; requestBodySha256: string; input: SelectInput };
type Actor = { subject: string; sessionId: string; signal?: AbortSignal };
const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const hex = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const validText = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max && !/\p{Surrogate}/u.test(s);
const keys = (v: unknown, wanted: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === wanted.length && wanted.every(k => Object.hasOwn(v, k));
function validFragments(f: unknown): f is Fragment[] {
  return Array.isArray(f) && f.length >= 1 && f.length <= 8 && f.every(x => keys(x, ['handle','text']) && validText(x.handle,300) && validText(x.text,12000)) && new Set(f.map(x => x.handle)).size === f.length && f.reduce((n, x) => n + x.text.length, 0) <= 20000;
}
export function prepareSelect(input: SelectInput): Prepared {
  const hasMode = Object.hasOwn(input,'mode');
  if (!keys(input,hasMode ? ['turnId','productSku','question','fragments','mode'] : ['turnId','productSku','question','fragments']) || (hasMode && input.mode!=='deterministic-mcu-v1') || !uuid(input.turnId) || !validText(input.productSku,128) || !validText(input.question,2000) || !validFragments(input.fragments)) throw Error('Invalid select input');
  const copy = structuredClone(input);
  const body = JSON.stringify({ version: 1, ...copy });
  if (Buffer.byteLength(body) > 98304) throw Error('Select body too large');
  return { body, requestBodySha256: hash(body), input: copy };
}

// JSON.parse accepts duplicate keys, so scan the grammar before parsing.
export function strictJson(raw: string): unknown {
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(raw[i] ?? '') && i < raw.length) i++; };
  const string = (): string => { const start = i++; while (i < raw.length) { if (raw[i] === '"') { i++; return JSON.parse(raw.slice(start,i)); } if (raw[i] === '\\') i++; i++; } throw Error('Invalid JSON'); };
  const value = (): void => { ws(); if (raw[i] === '"') { string(); return; } if (raw[i] === '{') { i++; ws(); const seen = new Set<string>(); if (raw[i] === '}') { i++; return; } while (true) { ws(); if (raw[i] !== '"') throw Error('Invalid JSON'); const k = string(); if (seen.has(k)) throw Error('Duplicate key'); seen.add(k); ws(); if (raw[i++] !== ':') throw Error('Invalid JSON'); value(); ws(); const c = raw[i++]; if (c === '}') return; if (c !== ',') throw Error('Invalid JSON'); } } if (raw[i] === '[') { i++; ws(); if (raw[i] === ']') { i++; return; } while (true) { value(); ws(); const c = raw[i++]; if (c === ']') return; if (c !== ',') throw Error('Invalid JSON'); } } const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(i)); if (!m) throw Error('Invalid JSON'); i += m[0].length; };
  value(); ws(); if (i !== raw.length) throw Error('Invalid JSON'); return JSON.parse(raw);
}
const codes: Record<number, string[]> = {202:['pending'],409:['outcome_unknown','turn_conflict','capability_replayed'],429:['busy','quota_exhausted'],503:['disabled','provider_unavailable'],422:['invalid_selection','budget_exceeded'],400:['invalid'],401:['unauthorized'],404:['not_found'],405:['method_not_allowed'],413:['too_large']};
export type WireResult = { version: 1; state: 'complete'; selections: Array<{handle:string;quote:string}>; usage: {modelCalls:number;inputTokens:number;outputTokens:number;costNanoUsd:number} } | {version:1; state:'pending'|'unknown'|'rejected'; code:string; usage:null};
export function verifyResponse(p: {status:number;body:string;receipt:string|null;secret:string;nonce:string;bodySha256:string;fragments:Fragment[];mode?:SelectionMode}): WireResult {
  if (p.mode!==undefined && p.mode!=='deterministic-mcu-v1') throw Error('Invalid mode');
  if (Buffer.byteLength(p.body) > 16384 || !validFragments(p.fragments) || !uuid(p.nonce) || !hex(p.bodySha256) || !p.receipt || !/^[A-Za-z0-9_-]{43}$/.test(p.receipt)) throw Error('Invalid response');
  const expected = hmac(p.secret, `response.v1\n${p.nonce}\n${p.bodySha256}\n${hash(p.body)}`);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(p.receipt))) throw Error('Invalid receipt');
  const v = strictJson(p.body);
  if (!v || typeof v !== 'object') throw Error('Invalid response');
  const x = v as Record<string, unknown>;
  if (x.version !== 1) throw Error('Invalid response');
  if (p.status === 200 && x.state === 'complete' && keys(x,['version','state','selections','usage']) && Array.isArray(x.selections) && x.selections.length <= 4 && keys(x.usage,['modelCalls','inputTokens','outputTokens','costNanoUsd'])) {
    const u = x.usage; const seen = new Set<string>();
    if (![u.modelCalls,u.inputTokens,u.outputTokens,u.costNanoUsd].every(n => Number.isSafeInteger(n) && (n as number) >= 0) || (p.mode==='deterministic-mcu-v1' ? (u.modelCalls!==0 || u.inputTokens!==0 || u.outputTokens!==0) : u.modelCalls!==1) || (u.inputTokens as number) > 32768 || (u.outputTokens as number) > 1024 || u.costNanoUsd !== 0) throw Error('Invalid usage');
    for (const s of x.selections) { if (!keys(s,['handle','quote']) || !validText(s.handle,300) || !validText(s.quote,600) || seen.has(s.handle) || !p.fragments.some(f => f.handle === s.handle && f.text.includes(s.quote as string))) throw Error('Invalid selection'); seen.add(s.handle); }
    return x as WireResult;
  }
  if (!keys(x,['version','state','code','usage']) || x.usage !== null || typeof x.code !== 'string' || !codes[p.status]?.includes(x.code) || x.state !== (x.code === 'pending' ? 'pending' : x.code === 'outcome_unknown' ? 'unknown' : 'rejected')) throw Error('Invalid response');
  return x as WireResult;
}

export function createLightweightClient(config: {baseUrl:string;secret:string;fetch?:typeof fetch;timeoutMs?:number;mode?:SelectionMode}) {
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) || !validText(config.secret,4096) || (config.mode!==undefined && config.mode!=='deterministic-mcu-v1')) throw Error('Invalid transport configuration');
  const timeoutMs = config.timeoutMs ?? 35000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw Error('Invalid timeout');
  async function send(action:'select'|'readturn', actor:Actor, turnId:string, sku:string, body:string, fragments:Fragment[]):Promise<WireResult> {
    if (!validText(actor.subject,512) || !validText(actor.sessionId,512) || !uuid(turnId) || !validText(sku,128) || !validFragments(fragments)) throw Error('Invalid capability context');
    const nonce = randomUUID(), bodySha256 = hash(body), iat = Math.floor(Date.now()/1000);
    const claims = {v:1,aud:'panda-lightweight-evidence-v1',action,sub:hash(actor.subject),sid:hash(actor.sessionId),turnId,sku,nonce,iat,exp:iat+60,bodySha256};
    const segment = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const token = `${segment}.${hmac(config.secret,segment)}`;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort=()=>controller.abort();
    actor.signal?.addEventListener('abort',abort,{once:true});
    if(actor.signal?.aborted)controller.abort();
    try {
      const response = await (config.fetch ?? fetch)(new URL(action === 'select' ? '/v1/evidence/select' : '/v1/evidence/status',url),{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body,signal:controller.signal,redirect:'error',cache:'no-store'});
      if (!response.body) throw Error('Missing body');
      const reader = response.body.getReader(); const chunks:Uint8Array[] = []; let size = 0;
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); throw Error('Response too large'); } chunks.push(value); }
      const bytes = Buffer.concat(chunks); const raw = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return verifyResponse({status:response.status,body:raw,receipt:response.headers.get('x-panda-receipt'),secret:config.secret,nonce,bodySha256,fragments,mode:config.mode});
    } catch { throw Error('Evidence outcome unknown'); } finally { clearTimeout(timer); actor.signal?.removeEventListener('abort',abort); }
  }
  return {
    select: async ({subject,sessionId,prepared,signal}:Actor & {prepared:Prepared}) => { const verified = prepareSelect(prepared.input); if (verified.body !== prepared.body || verified.requestBodySha256 !== prepared.requestBodySha256 || verified.input.mode!==config.mode) throw Error('Invalid prepared request'); return send('select',{subject,sessionId,signal},verified.input.turnId,verified.input.productSku,verified.body,verified.input.fragments); },
    status: async ({subject,sessionId,turnId,productSku,requestBodySha256,fragments,signal}:Actor & {turnId:string;productSku:string;requestBodySha256:string;fragments:Fragment[]}) => { if (!hex(requestBodySha256)) throw Error('Invalid original digest'); return send('readturn',{subject,sessionId,signal},turnId,productSku,JSON.stringify({version:1,turnId,requestBodySha256}),fragments); },
  };
}
