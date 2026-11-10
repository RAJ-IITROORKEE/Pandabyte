import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';

type Result = { answer: string; usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }; timing?: unknown };
type Complete = (input: { question: string }, beforeSend: () => Promise<boolean>, signal: AbortSignal) => Promise<Result>;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, maxLength: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= maxLength && v.isWellFormed();
const model = 'openai/gpt-6-luna';

/** Native prompts are never authority: only the fixed transport system prompt and this exact admitted question reach the provider. */
export function createBasicLlmRelay(options: { token: string; question: string; complete: Complete; current(): Promise<boolean>; signal: AbortSignal }) {
  if (!/^[a-f0-9]{64}$/.test(options.token) || !text(options.question, 2000)) throw Error('invalid_relay');
  const token = Buffer.from('Bearer ' + options.token);
  let used = false, attempts = 0, stage = 'idle', result: Result | null = null;
  const controllers = new Set<AbortController>();
  const authenticated = (request: IncomingMessage) => {
    const supplied = Buffer.from(request.headers.authorization ?? '');
    return supplied.length === token.length && timingSafeEqual(supplied, token);
  };
  const error = (response: ServerResponse, status: number) => {
    if (!response.destroyed && !response.headersSent) response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{"error":{"message":"Local request unavailable","type":"invalid_request_error"}}');
  };
  const server = createServer(async (request, response) => {
    const controller = new AbortController(); controllers.add(controller);
    const cancel = () => controller.abort();
    request.once('aborted', cancel);
    response.once('close', () => { if (!response.writableEnded) cancel(); });
    const signal = AbortSignal.any([controller.signal, options.signal, AbortSignal.timeout(60000)]);
    try {
      if (!authenticated(request)) return error(response, 401);
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions' || request.headers.origin !== undefined
        || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return error(response, 400);
      attempts++;
      if (used) return error(response, 409);
      // Even a malformed authenticated first attempt seals this one-prompt execution.
      used = true;
      stage = 'body';
      const parts: Buffer[] = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 200000 || signal.aborted) throw Error(); parts.push(Buffer.from(chunk)); }
      const value = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
      stage = 'model_stream_tools';
      if (!object(value) || value.model !== model || value.stream !== true || !Array.isArray(value.messages) || value.messages.length > 12
        || (value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.length !== 0)) || value.functions !== undefined
        || (value.tool_choice !== undefined && !['none', 'auto'].includes(value.tool_choice as string))) return error(response, 400);
      let question: string | null = null;
      stage = 'messages';
      for (const message of value.messages) {
        if (!object(message) || !['system', 'user'].includes(message.role as string) || message.tool_calls !== undefined || message.function_call !== undefined) return error(response, 400);
        if (message.role === 'system') continue;
        if (question !== null) return error(response, 400);
        const content = message.content;
        if (typeof content === 'string') question = content;
        else if (Array.isArray(content) && content.length === 1 && object(content[0]) && content[0].type === 'text' && typeof content[0].text === 'string') question = content[0].text;
        else return error(response, 400);
      }
      stage = 'question';
      if (question !== options.question) return error(response, 403);
      stage = 'actor';
      if (signal.aborted || !await options.current()) return error(response, 403);
      stage = 'completion';
      const completed = await options.complete({ question }, async () => !signal.aborted && await options.current() && !signal.aborted, signal);
      if (!text(completed.answer, 10000)) throw Error();
      if (signal.aborted || !await options.current() || signal.aborted) throw Error();
      stage = 'completed';
      result = structuredClone(completed);
      const id = 'chatcmpl-' + randomUUID(), created = Math.floor(Date.now() / 1000);
      const chunk = (delta: object, finish_reason: string | null = null) => JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] });
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'close' });
      response.end('data: ' + chunk({ role: 'assistant', content: JSON.stringify({ answer: completed.answer }) }) + '\n\ndata: ' + chunk({}, 'stop') + '\n\ndata: [DONE]\n\n');
    } catch (failure) { if (stage === 'completion') stage += ':' + (object(failure) && ['not_admitted', 'outcome_unknown', 'unavailable', 'ERR_ASSERTION'].includes(failure.code as string) ? failure.code : 'failed'); error(response, 503); }
    finally { controllers.delete(controller); request.removeListener('aborted', cancel); }
  });
  server.requestTimeout = 60000; server.headersTimeout = 5000;
  return {
    async listen() { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); const address = server.address(); if (!address || typeof address === 'string') throw Error(); return 'http://127.0.0.1:' + address.port + '/v1'; },
    async close() { for (const controller of controllers) controller.abort(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); },
    snapshot() { return { attempts, used, stage, result: result ? structuredClone(result) : null }; },
  };
}
