import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';
import { researchJSON, researchObject, type ResearchObject, type ResearchValue } from './research-values.ts';
import { researchProfileSelection, isVisionResearchProfile } from '../../runtime/opencode/research-profile.mjs';
import { nativeUserImageMatches, parseResearchUserContent } from './research-image-binding.ts';
import type { ResearchProfileID } from './research-runtime.ts';
import {projectResearchTurn} from './research-transcript.ts';
import {hostedResearchModel,researchMaxInput} from '../server/hosted-model-policy.ts';
import type {ResearchRunReceipt,ResearchRunRecord} from '../server/research-runtime-store.ts';
import type {NativeSessionState} from './session-contracts.ts';

const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const nativeID = (value: unknown, prefix = 'msg'): value is string => typeof value === 'string' && new RegExp('^' + prefix + '_[a-f0-9]{12}[A-Za-z0-9]{14}$').test(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= max;
const callID = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value);
const only = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && only(value, keys);
const digestText = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export function canonicalResearchJSON(value: unknown): string {
  if (!researchJSON(value, 1048576)) throw Error('invalid_research_json');
  const canonical = (item: ResearchValue): ResearchValue => Array.isArray(item) ? item.map(canonical)
    : researchObject(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key] as ResearchValue)])) : item;
  return JSON.stringify(canonical(value));
}
export function hashResearchValue(value: unknown): string { return digestText(canonicalResearchJSON(value)); }

export type ResearchProviderUsage = { inputTokens: number; outputTokens: number; costNanoUsd: number };
export type ResearchProviderToolCall = { id: string; name: string; arguments: ResearchObject };
export type ResearchProviderResult = { content: string; usage: ResearchProviderUsage; receipt?: ResearchObject } | { toolCalls: ResearchProviderToolCall[]; content?:string; usage: ResearchProviderUsage; receipt?: ResearchObject };
export type ResearchProviderBody = ResearchObject & { model: string; stream: true; messages: ResearchObject[] };
export type ResearchSettledAttempt = { attemptKey: string; result: ResearchProviderResult; requestHash?:string; resultHash?:string; assistantMessageID?: string };
export type ResearchFrontierCall = { id: string; name: string; inputHash: string; status: 'completed' | 'error'; contentHash: string };
export type ResearchFrontier = { v: 1; messageID: string; steps: { attemptKey: string; assistantMessageID: string; calls: ResearchFrontierCall[] }[] };

function validInput(value: unknown): value is ResearchObject {
  return researchObject(value) && exact(value, ['query']) && text(value.query, 1600) && value.query.length >= 1 && value.query.length <= 400
    && !!value.query.trim() && !/[\p{Cc}\p{Cf}]/u.test(value.query);
}
function validResult(value: unknown, profile: ResearchProfileID): value is ResearchProviderResult {
  const {toolName,outputTokens,usageMode,modelID}=researchProfileSelection(profile),hosted=usageMode==='hosted';
  // The cost cap and input bound are the selected model's frozen policy; an unknown hosted model fails closed.
  const model=hosted?hostedResearchModel(modelID):null;
  if (hosted&&model===null) return false;
  if (!researchJSON(value, 65536) || !researchObject(value) || !researchObject(value.usage)
    || !exact(value.usage, ['inputTokens', 'outputTokens', 'costNanoUsd'])
    || !Number.isSafeInteger(value.usage.inputTokens) || (value.usage.inputTokens as number) < 0 || (value.usage.inputTokens as number) > (model?.maxInput ?? researchMaxInput)
    || !Number.isSafeInteger(value.usage.outputTokens) || (value.usage.outputTokens as number) < 0 || (value.usage.outputTokens as number) > outputTokens
    || (hosted ? !Number.isSafeInteger(value.usage.costNanoUsd)||(value.usage.costNanoUsd as number)<0||(value.usage.costNanoUsd as number)>model!.reservationNanoUsd||!researchObject(value.receipt) : value.usage.costNanoUsd !== 0)) return false;
  const extra=hosted?['receipt']:[];
  if (!('toolCalls' in value)) return exact(value, ['content', 'usage',...extra]) && text(value.content, 24000) && !!value.content.trim();
  if(value.content!==undefined&&(!hosted||!text(value.content,24000)||!value.content.trim()))return false;
  return exact(value, ['toolCalls', 'usage',...extra,...(value.content!==undefined?['content']:[])]) && Array.isArray(value.toolCalls) && value.toolCalls.length >= 1 && value.toolCalls.length <= (hosted?4:16)
    && value.toolCalls.every(call => researchObject(call) && exact(call, ['id', 'name', 'arguments']) && callID(call.id) && call.name === toolName && validInput(call.arguments))
    && new Set(value.toolCalls.map(call => (call as ResearchObject).id)).size === value.toolCalls.length;
}
// Only the research MCP shim's own fixed failure strings may reach the provider through an errored tool result.
const nativeToolFailures = new Set(['Public search unavailable', 'Synthetic fixture unavailable']);
function nativeErrorWire(error: unknown): string[] | null {
  if (!researchObject(error) || !exact(error, ['type', 'message']) || error.type !== 'tool.execution' || typeof error.message !== 'string' || !nativeToolFailures.has(error.message)) return null;
  return [JSON.stringify({ error: { type: error.type, message: error.message }, content: [] })];
}
function content(value: unknown, empty = false): string[] | null {
  if (value === null && empty) return [];
  if (typeof value === 'string') return text(value, 98304) ? empty && value === '' ? [] : [value] : null;
  if (!Array.isArray(value) || value.length > 32) return null;
  const parts: string[] = [];
  for (const item of value) {
    if (!researchObject(item) || !exact(item, ['type', 'text']) || item.type !== 'text' || !text(item.text, 24000)) return null;
    parts.push(item.text);
  }
  return Buffer.byteLength(parts.join(''), 'utf8') <= 98304 ? parts : null;
}
function parsedCalls(value: unknown, toolName: string): ResearchProviderToolCall[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 16) return null;
  const calls: ResearchProviderToolCall[] = [];
  for (const call of value) {
    if (!researchObject(call) || !exact(call, ['id', 'type', 'function']) || !callID(call.id) || call.type !== 'function'
      || !researchObject(call.function) || !exact(call.function, ['name', 'arguments']) || call.function.name !== toolName || !text(call.function.arguments, 24000)) return null;
    let args: unknown;
    try { args = strictJson(call.function.arguments); } catch { return null; }
    if (!validInput(args)) return null;
    calls.push({ id: call.id, name: call.function.name, arguments: args });
  }
  return new Set(calls.map(call => call.id)).size === calls.length ? calls : null;
}
function toolSchema(value: unknown, toolName: string): boolean {
  if (!researchObject(value) || !exact(value, ['type', 'function']) || value.type !== 'function' || !researchObject(value.function)) return false;
  const f = value.function, p = f.parameters;
  if (!only(f, ['name', 'description', 'parameters', 'strict']) || f.name !== toolName || f.description !== undefined && !text(f.description, 2000)
    || f.strict !== undefined && typeof f.strict !== 'boolean' || !researchObject(p)
    || !only(p, ['type', 'properties', 'required', 'additionalProperties', '$schema', 'description', 'title']) || p.type !== 'object'
    || !researchObject(p.properties) || !exact(p.properties, ['query']) || !researchObject(p.properties.query)
    || !Array.isArray(p.required) || p.required.length !== 1 || p.required[0] !== 'query'
    || p.additionalProperties !== undefined && p.additionalProperties !== false
    || p.$schema !== undefined && p.$schema !== 'http://json-schema.org/draft-07/schema#' && p.$schema !== 'https://json-schema.org/draft-07/schema#') return false;
  const q = p.properties.query;
  return only(q, ['type', 'description', 'title', 'minLength', 'maxLength']) && q.type === 'string'
    && [p.description, p.title, q.description, q.title].every(v => v === undefined || text(v, 2000))
    && (q.minLength === undefined || q.minLength === 1) && (q.maxLength === undefined || q.maxLength === 400);
}
function validBody(value: unknown, profile: ResearchProfileID): value is ResearchProviderBody {
  const {toolName,modelID,outputTokens}=researchProfileSelection(profile),vision=isVisionResearchProfile(profile);
  let images=0;
  if (!researchJSON(value, 131072) || !researchObject(value) || !only(value, ['model', 'stream', 'messages', 'tools', 'tool_choice', 'parallel_tool_calls', 'stream_options', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p', 'presence_penalty', 'frequency_penalty', 'seed', 'stop'])
    || value.model !== modelID || value.stream !== true || !Array.isArray(value.messages) || !value.messages.length || value.messages.length > 200) return false;
  if (value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.length > 1 || !value.tools.every(tool => toolSchema(tool, toolName)))) return false;
  if (value.tool_choice !== undefined && !['auto', 'none', 'required'].includes(value.tool_choice as string)
    || value.parallel_tool_calls !== undefined && typeof value.parallel_tool_calls !== 'boolean'
    || value.stream_options !== undefined && (!researchObject(value.stream_options) || !exact(value.stream_options, ['include_usage']) || typeof value.stream_options.include_usage !== 'boolean')
    || value.max_tokens !== undefined && value.max_completion_tokens !== undefined) return false;
  for (const name of ['max_tokens', 'max_completion_tokens'])
    if (value[name] !== undefined && (!Number.isSafeInteger(value[name]) || (value[name] as number) < 1 || (value[name] as number) > outputTokens)) return false;
  for (const [name, min, max] of [['temperature', 0, 2], ['top_p', 0, 1], ['presence_penalty', -2, 2], ['frequency_penalty', -2, 2]] as const)
    if (value[name] !== undefined && (typeof value[name] !== 'number' || (value[name] as number) < min || (value[name] as number) > max)) return false;
  if (value.seed !== undefined && !Number.isSafeInteger(value.seed) || value.stop !== undefined && !(text(value.stop, 256)
    || Array.isArray(value.stop) && value.stop.length <= 4 && value.stop.every(v => text(v, 256)))) return false;
  for (const message of value.messages) {
    if (!researchObject(message) || !['system', 'user', 'assistant', 'tool'].includes(message.role as string)) return false;
    if (message.role === 'tool') {
      if (!exact(message, ['role', 'tool_call_id', 'content']) || !callID(message.tool_call_id) || content(message.content) === null) return false;
    } else if (message.role === 'assistant') {
      if (!only(message, ['role', 'content', 'tool_calls']) || content(message.content ?? null, true) === null
        || message.tool_calls !== undefined && parsedCalls(message.tool_calls, toolName) === null) return false;
    } else if (!exact(message, ['role', 'content'])) return false;
    else if (message.role === 'user') {
      // The shared content() stays text-only for tool/assistant/system; only a vision profile's user message may carry one trailing image, and at most one per body.
      const parsed = parseResearchUserContent(message.content, vision);
      if (parsed === null || parsed.image !== null && ++images > 1) return false;
    } else if (content(message.content) === null) return false;
  }
  return true;
}

export function validResearchProviderBody(value:unknown,profile:ResearchProfileID='synthetic-echo'):value is ResearchProviderBody{
  try{return validBody(value,profile);}catch{return false;}
}

/** Digest recovery must run BEFORE this helper: lazy publication never permits another physical call. */
export function deriveResearchFrontier(expected: { messageID: string; promptHash: string; imageSha256?: string }, nativeMessages: unknown,
  attempts: readonly ResearchSettledAttempt[], providerBody: unknown, profile: ResearchProfileID = 'synthetic-echo',verifyHostedAttempt?:(attempt:ResearchSettledAttempt)=>boolean): { frontier: ResearchFrontier; associations: { attemptKey: string; assistantMessageID: string }[] } | null {
  try {
    const { toolName,usageMode,modelID } = researchProfileSelection(profile),hosted=usageMode==='hosted',vision=isVisionResearchProfile(profile),imageSha256=expected.imageSha256;
    // Native 2.2.5 openai-chat lowerMessages truncates IDs only for openai/* models; the descriptor owns that observed length.
    const descriptor=hosted?hostedResearchModel(modelID):null;
    if(hosted&&descriptor===null)return null;
    const historyIDMax=descriptor?.historyIdMax??null;
    const historyIDSanitize=descriptor?.historyIdSanitize===true,historyID = (id: string) => { const sanitized = historyIDSanitize ? id.replace(/[^A-Za-z0-9_-]/g, '_') : id; return historyIDMax===null ? sanitized : sanitized.slice(0, historyIDMax); };
    if (!researchJSON({ expected, nativeMessages, attempts }, 1048576) || !nativeID(expected.messageID) || !hex(expected.promptHash)
      || imageSha256 !== undefined && !hex(imageSha256) || !Array.isArray(nativeMessages) || nativeMessages.length > 200 || !Array.isArray(attempts) || attempts.length > 6 || !validBody(providerBody, profile)
      ||hosted&&typeof verifyHostedAttempt!=='function') return null;
    const seen = new Set<string>(); let previous = -1;
    for (const row of nativeMessages) {
      if (!researchObject(row) || !nativeID(row.id) || seen.has(row.id) || !researchObject(row.time)
        || typeof row.time.created !== 'number' || !Number.isFinite(row.time.created) || row.time.created < previous) return null;
      seen.add(row.id); previous = row.time.created;
    }
    const start = nativeMessages.findIndex(row => row.id === expected.messageID);
    if (start < 0) return null;
    if (nativeMessages.slice(0, start).some(row => row.type === 'assistant' && (typeof row.time.completed !== 'number'
      || !Number.isFinite(row.time.completed) || row.time.completed < row.time.created))) return null;
    const user = nativeMessages[start];
    if (user.type !== 'user' || !text(user.text, 98304) || digestText(user.text) !== expected.promptHash || !nativeUserImageMatches(user, imageSha256)) return null;
    const rows = nativeMessages.slice(start + 1), messages = providerBody.messages;
    const lastUser = messages.findLastIndex(message => message.role === 'user');
    if (lastUser < 0 || rows.length !== attempts.length) return null;
    // C4: the bound user message is its text parts (hashing to promptHash) then exactly the receipt's image, or no image anywhere when the receipt has none.
    const bound = parseResearchUserContent(messages[lastUser].content, vision);
    if (bound === null || digestText(bound.texts.join('')) !== expected.promptHash || (imageSha256 === undefined ? bound.image !== null : bound.image?.sha256 !== imageSha256)
      || messages.some((message, index) => index !== lastUser && message.role === 'user' && parseResearchUserContent(message.content, vision)?.image)) return null;
    let offset = lastUser + 1;
    const frontier: ResearchFrontier = { v: 1, messageID: expected.messageID, steps: [] }, associations: { attemptKey: string; assistantMessageID: string }[] = [];
    const attemptKeys = new Set<string>(), callIDs = new Set<string>(), historyIDs = new Set<string>();
    for (const [index, attempt] of attempts.entries()) {
      if (!hex(attempt.attemptKey) || attemptKeys.has(attempt.attemptKey) || !validResult(attempt.result, profile) || !('toolCalls' in attempt.result)
        ||hosted&&(!hex(attempt.requestHash)||verifyHostedAttempt!(attempt)!==true)) return null;
      attemptKeys.add(attempt.attemptKey);
      const row = rows[index];
      if (row.type !== 'assistant' || !Array.isArray(row.content) || row.content.length > 128 || row.error !== undefined || row.retry !== undefined
        || typeof row.time.completed !== 'number' || !Number.isFinite(row.time.completed) || row.time.completed < row.time.created
        || attempt.assistantMessageID !== undefined && attempt.assistantMessageID !== row.id) return null;
      const parts = row.content.filter((part: unknown) => researchObject(part) && part.type === 'tool');
      if (parts.length !== attempt.result.toolCalls.length || row.content.some((part: unknown) => !researchObject(part) || !['text', 'reasoning', 'tool'].includes(part.type as string)
        || part.type !== 'tool' && !text(part.text, 24000))) return null;
      const outgoing = messages[offset++];
      const prior = outgoing?.role === 'assistant' ? parsedCalls(outgoing.tool_calls, toolName) : null;
      const expectedHistory = attempt.result.toolCalls.map((call: ResearchProviderToolCall) => ({ ...call, id: historyID(call.id) }));
      if (!prior || hashResearchValue(prior) !== hashResearchValue(expectedHistory)) return null;
      if(hosted){const actual=row.content.filter((part:unknown)=>researchObject(part)&&part.type==='text').map((part:ResearchObject)=>part.text).join('');
        if(actual!==(attempt.result.content??'')||(content(outgoing.content??null,true)??[]).join('')!==actual)return null;}
      const frontierCalls: ResearchFrontierCall[] = [];
      for (const call of attempt.result.toolCalls) {
        const loweredID = historyID(call.id);
        if (callIDs.has(call.id) || historyIDs.has(loweredID)) return null;
        callIDs.add(call.id); historyIDs.add(loweredID);
        const matches = parts.filter((part: Record<string, unknown>) => part.id === call.id);
        if (matches.length !== 1) return null;
        const part = matches[0];
        if (part.name !== call.name || !researchObject(part.state) || !researchObject(part.time) || !['completed', 'error'].includes(part.state.status as string)
          || !validInput(part.state.input) || hashResearchValue(part.state.input) !== hashResearchValue(call.arguments)
          || typeof part.time.created !== 'number' || part.time.created < row.time.created
          || typeof part.time.completed !== 'number' || part.time.completed < part.time.created || part.time.completed > row.time.completed
          || part.time.ran !== undefined && (typeof part.time.ran !== 'number' || part.time.ran < part.time.created || part.time.ran > part.time.completed)) return null;
        const nativeContent = part.state.status === 'error' ? [] : Array.isArray(part.state.content) ? content(part.state.content) : null;
        if (!nativeContent || part.state.status === 'completed' && !nativeContent.length || nativeContent.some(v => !text(v, 24000))) return null;
        // Observed OpenCode 2.2.5 (11 Nov 2026): an errored tool reaches the provider as the exact JSON string
        // {"error":{"type","message"},"content":[]} rebuilt here from the native part. The frontier keeps hash([]) for the private projection.
        const wireContent = part.state.status === 'error' ? nativeErrorWire(part.state.error) : nativeContent;
        const result = messages[offset++];
        if (!wireContent || result?.role !== 'tool' || result.tool_call_id !== loweredID || hashResearchValue(content(result.content)) !== hashResearchValue(wireContent)) return null;
        frontierCalls.push({ id: call.id, name: call.name, inputHash: hashResearchValue(call.arguments), status: part.state.status as 'completed' | 'error', contentHash: hashResearchValue(nativeContent) });
      }
      frontier.steps.push({ attemptKey: attempt.attemptKey, assistantMessageID: row.id, calls: frontierCalls });
      associations.push({ attemptKey: attempt.attemptKey, assistantMessageID: row.id });
    }
    return offset === messages.length ? { frontier, associations } : null;
  } catch { return null; }
}

/** Reconcile paid output against the owned durable record; this never admits or releases work. */
export function matchResearchStopResult(input:{profile:ResearchProfileID;receipt:ResearchRunReceipt;record:ResearchRunRecord;session:NativeSessionState;active:boolean;messages:unknown;attempts:readonly ResearchSettledAttempt[]},verifyHostedAttempt:(attempt:ResearchSettledAttempt)=>boolean):{operationKey:string;resultHash:string;assistantMessageID:string;content:string;callsDigest:string}|null{
  try{
    if(!researchJSON(input,2097152)||typeof verifyHostedAttempt!=='function'||researchProfileSelection(input.profile).usageMode!=='hosted'||!input.record||!Array.isArray(input.attempts)||!input.attempts.length||input.attempts.length>6
      ||hashResearchValue(input.receipt)!==hashResearchValue(input.record.receipt)||!Array.isArray(input.record.operations)||input.record.operations.length>64||input.record.cancelled
      ||input.record.operations.some(op=>!['primary','tool'].includes(op.kind)||op.state!=='settled'||!hex(op.key)||!hex(op.requestHash)||!hex(op.resultHash))
      ||new Set(input.record.operations.map(op=>op.kind+op.key)).size!==input.record.operations.length)return null;
    const projected=projectResearchTurn({messageID:input.receipt.messageID,promptHash:input.receipt.promptHash,...(input.receipt.imageSha256===undefined?{}:{imageSha256:input.receipt.imageSha256})},input.session,input.active,input.messages,['panda_research_search']);
    if(projected.state!=='terminal'||projected.outcome!=='succeeded'||!Array.isArray(input.messages))return null;
    const rows=input.messages as ResearchObject[],start=rows.findIndex(row=>row.id===input.receipt.messageID),assistants=rows.slice(start+1).filter(row=>row.type==='assistant');
    const primary=input.record.operations.filter(op=>op.kind==='primary');
    if(primary.length!==input.attempts.length||assistants.length!==primary.length)return null;
    for(const [index,attempt]of input.attempts.entries()){
      const op=primary[index],row=assistants[index];
      if(attempt.attemptKey!==op.key||attempt.requestHash!==op.requestHash||attempt.resultHash!==op.resultHash||hashResearchValue(attempt.result)!==op.resultHash
        ||!validResult(attempt.result,input.profile)||verifyHostedAttempt(attempt)!==true||attempt.assistantMessageID!==undefined&&attempt.assistantMessageID!==row.id)return null;
      const nativeText=(row.content as ResearchObject[]).filter(part=>part.type==='text').map(part=>part.text).join('');
      if(nativeText!==(attempt.result.content??''))return null;
      if(index===primary.length-1){
        if('toolCalls'in attempt.result||attempt.result.content!==projected.text||op.association!==undefined&&(op.association.assistantMessageID!==row.id||op.association.callsDigest!==hashResearchValue([])))return null;
      }else{
        if(!('toolCalls'in attempt.result)||attempt.assistantMessageID!==row.id||op.association?.assistantMessageID!==row.id)return null;
        const tools=projected.tools.filter(tool=>tool.assistantMessageID===row.id);
        if(tools.length!==attempt.result.toolCalls.length)return null;
        const frontierCalls:ResearchFrontierCall[]=[];
        for(const call of attempt.result.toolCalls){const matches=tools.filter(tool=>tool.id===call.id&&tool.name===call.name&&hashResearchValue(tool.input)===hashResearchValue(call.arguments));if(matches.length!==1)return null;const tool=matches[0];frontierCalls.push({id:tool.id,name:tool.name,inputHash:hashResearchValue(tool.input),status:tool.status,contentHash:hashResearchValue(tool.content)});}
        if(op.association.callsDigest!==hashResearchValue(frontierCalls))return null;
      }
    }
    const last=primary.at(-1)!,row=assistants.at(-1)!;
    return{operationKey:last.key,resultHash:last.resultHash!,assistantMessageID:row.id as string,content:projected.text,callsDigest:hashResearchValue([])};
  }catch{return null;}
}

export type ResearchProviderRequest = { method: string; path: string; headers: Record<string, string | string[] | undefined>; body: string | Buffer };
export type ResearchProviderResponse = { status: number; contentType: string; body: Buffer };
export type ResearchProviderIdentity = { sessionID: string; kind: 'primary'; generation: string; requestHash: string; body: ResearchProviderBody };
export type ResearchProviderOptions<Binding, Grant> = {
  token: string; sessionID: string; generation: string; signal: AbortSignal; profile?: ResearchProfileID;
  authorize(identity: ResearchProviderIdentity): Promise<Binding | null>;
  current(binding: Binding): Promise<boolean>;
  claim(binding: Binding): Promise<{ state: 'dispatch' | 'unknown' | 'conflict' } | { state: 'cached'; result: ResearchProviderResult }>;
  beforeSend(binding: Binding): Promise<Grant | null>;
  complete(body: ResearchProviderBody, beforeSend: () => Promise<boolean>, signal: AbortSignal, binding:Binding): Promise<ResearchProviderResult>;
  verifyHostedResult?(binding:Binding,result:ResearchProviderResult,identity:ResearchProviderIdentity):boolean;
  settle(binding: Binding, grant: Grant, result: ResearchProviderResult): Promise<void>;
  authorizeRelease(binding: Binding, result: ResearchProviderResult): Promise<boolean>;
  denied?(kind: string): Promise<unknown>;
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function response(status: number): ResearchProviderResponse {
  return { status, contentType: 'application/json', body: Buffer.from('{"error":{"message":"Local request unavailable","type":"invalid_request_error"}}') };
}
function sse(result: ResearchProviderResult,profile:ResearchProfileID): ResearchProviderResponse {
  const selected=researchProfileSelection(profile),model=selected.modelID;
  const id = 'chatcmpl-' + randomUUID(), created = Math.floor(Date.now() / 1000);
  const chunk = (delta: object, finish_reason: string | null = null) => 'data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
  let output = chunk({ role: 'assistant' });
  if(result.content!==undefined)output+=chunk({content:result.content});
  if ('toolCalls' in result) for (const [index, call] of result.toolCalls.entries()) {
    output += chunk({ tool_calls: [{ index, id: call.id, type: 'function', function: { name: call.name, arguments: '' } }] });
    output += chunk({ tool_calls: [{ index, function: { arguments: canonicalResearchJSON(call.arguments) } }] });
  }
  output += chunk({}, 'toolCalls' in result ? 'tool_calls' : 'stop');
  if(selected.usageMode==='hosted'){
    const receipt=result.receipt!,raw=receipt.usageReceipt as ResearchObject,details=researchObject(raw.prompt_tokens_details)?raw.prompt_tokens_details:{};
    output+='data: '+JSON.stringify({id,object:'chat.completion.chunk',created,model,choices:[],usage:{prompt_tokens:result.usage.inputTokens,completion_tokens:result.usage.outputTokens,total_tokens:result.usage.inputTokens+result.usage.outputTokens,
      prompt_tokens_details:{cached_tokens:receipt.cachedTokens,cache_write_tokens:details.cache_write_tokens??0},completion_tokens_details:{reasoning_tokens:receipt.reasoningTokens}}})+'\n\n';
  }
  output+='data: [DONE]\n\n';
  return { status: 200, contentType: 'text/event-stream', body: Buffer.from(output) };
}

/** The host supplies completion and, only for the immutable hosted profile, its receipt verifier. */
export function createResearchProviderGateway<Binding, Grant>(options: ResearchProviderOptions<Binding, Grant>) {
  const profile=options.profile===undefined?'synthetic-echo':options.profile,selected=researchProfileSelection(profile),hosted=selected.usageMode==='hosted';
  if(hosted?typeof options.verifyHostedResult!=='function':options.verifyHostedResult!==undefined)throw Error('invalid_research_gateway');
  if (!hex(options.token) || !hex(options.generation) || !nativeID(options.sessionID, 'ses')) throw Error('invalid_research_gateway');
  const secret = Buffer.from('Bearer ' + options.token), controllers = new Set<AbortController>();
  let closed = false;
  async function handle(request: ResearchProviderRequest, externalSignal?: AbortSignal): Promise<ResearchProviderResponse> {
    const controller = new AbortController(); controllers.add(controller);
    const signal = AbortSignal.any([controller.signal, options.signal, ...(externalSignal ? [externalSignal] : []), AbortSignal.timeout(60000)]);
    try {
      if (closed || signal.aborted) return response(503);
      const h = request.headers, supplied = Buffer.from(typeof h.authorization === 'string' ? h.authorization : '');
      if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) return response(401);
      if (request.method !== 'POST' || request.path !== '/v1/chat/completions' || h.origin !== undefined
        || typeof h['content-type'] !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(h['content-type'])) return response(400);
      if (h['x-panda-native-session'] !== options.sessionID || h['x-panda-native-generation'] !== options.generation) return response(403);
      if (h['x-panda-native-kind'] !== 'primary') { await options.denied?.(typeof h['x-panda-native-kind'] === 'string' ? h['x-panda-native-kind'] : 'invalid'); return response(403); }
      let body: unknown;
      try {
        if (typeof request.body !== 'string' && !Buffer.isBuffer(request.body) || Buffer.byteLength(request.body) > 131072) return response(400);
        if (typeof request.body === 'string' && !request.body.isWellFormed()) return response(400);
        body = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(request.body)));
      } catch { return response(400); }
      if (!validBody(body, profile)) return response(400);
      const reviewed = freeze(structuredClone(body));
      const identity = freeze({ sessionID: options.sessionID, generation: options.generation, kind: 'primary' as const, requestHash: hashResearchValue(reviewed), body: reviewed });
      const binding = await options.authorize(identity);
      if (binding === null || signal.aborted || !await options.current(binding) || signal.aborted) return response(403);
      const claimed = await options.claim(binding);
      if (claimed.state === 'unknown' || claimed.state === 'conflict') return response(409);
      let result: ResearchProviderResult;
      if (claimed.state === 'cached') {
        if (!validResult(claimed.result, profile)||hosted&&options.verifyHostedResult!(binding,claimed.result,identity)!==true) return response(503);
        result = freeze(structuredClone(claimed.result));
      } else {
        let beforeUsed = false, grant: Grant | null = null;
        const beforeSend = async () => {
          if (beforeUsed) return false;
          beforeUsed = true;
          if (signal.aborted || !await options.current(binding) || signal.aborted) return false;
          grant = await options.beforeSend(binding);
          return grant !== null;
        };
        const completed = await options.complete(reviewed, beforeSend, signal,binding);
        if (!beforeUsed || grant === null || !validResult(completed, profile)||hosted&&options.verifyHostedResult!(binding,completed,identity)!==true) return response(503);
        result = freeze(structuredClone(completed));
        // An exact already-sent receipt must survive cancellation/rotation; settlement never grants release.
        await options.settle(binding, grant, result);
      }
      if (signal.aborted || !await options.current(binding) || signal.aborted || !await options.authorizeRelease(binding, result) || signal.aborted) return response(503);
      return sse(result,profile);
    } catch { return response(503); }
    finally { controllers.delete(controller); }
  }
  const server = createServer(async (request, reply) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort); reply.once('close', () => { if (!reply.writableEnded) abort(); });
    try {
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of request) { size += chunk.length; if (size > 131072 || controller.signal.aborted) throw Error('invalid_request'); chunks.push(Buffer.from(chunk)); }
      const result = await handle({ method: request.method ?? '', path: request.url ?? '', headers: request.headers, body: Buffer.concat(chunks) }, controller.signal);
      if (!reply.destroyed) reply.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store', connection: 'close' }).end(result.body);
    } catch { if (!reply.destroyed && !reply.headersSent) { const result = response(400); reply.writeHead(result.status, { 'content-type': result.contentType, 'cache-control': 'no-store' }).end(result.body); } }
    finally { request.removeListener('aborted', abort); }
  });
  server.requestTimeout = 60000; server.headersTimeout = 5000;
  return {
    handle,
    async listen() {
      if (closed || server.listening) throw Error('invalid_research_gateway');
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
      const address = server.address(); if (!address || typeof address === 'string') throw Error('invalid_research_gateway');
      return 'http://127.0.0.1:' + address.port + '/v1';
    },
    async close() { closed = true; for (const controller of controllers) controller.abort(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
