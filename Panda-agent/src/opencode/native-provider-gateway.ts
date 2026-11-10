import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';

const model = 'openai/gpt-6-luna';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
type Binding = Readonly<{ owner: string; rootRun: string; session: string; message: string; step: string; kind: 'main'; bodyHash: string }>;
type Usage = { inputTokens: number; outputTokens: number; costNanoUsd: number };
type Options = {
  token: string; signal: AbortSignal;
  // Admission must derive the identity from trusted native execution state, not the bearer or prompt.
  authorize(bodyHash: string, messages: readonly unknown[]): Promise<Binding | null>;
  current(binding: Binding): Promise<boolean>;
  // This hook must atomically reserve the existing shared allowance and reject duplicate binding/unknown outcomes.
  reserve(binding: Binding): Promise<boolean>;
  // Trusted transport must freshly verify the exact Luna/Azure ZDR endpoint and prices, disable fallback,
  // cache, reasoning and tools, and validate the actual model/provider/usage receipt before returning.
  complete(messages: unknown[], beforeSend: () => Promise<boolean>, signal: AbortSignal): Promise<{ content: string; usage: Usage }>;
  receipt(binding: Binding, usage: Usage): Promise<void>;
};

/** This is an admission boundary, not a provider implementation. Never wire an unverified complete hook. */
export function createNativeProviderGateway(options: Options) {
  if (!/^[a-f0-9]{64}$/.test(options.token)) throw Error('invalid_gateway');
  const secret = Buffer.from('Bearer ' + options.token), used = new Set<string>();
  let claimed = 0;
  const controllers = new Set<AbortController>();
  const server = createServer(async (request, response) => {
    const controller = new AbortController(); controllers.add(controller);
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', () => { if (!response.writableEnded) abort(); });
    const signal = AbortSignal.any([controller.signal, options.signal, AbortSignal.timeout(60000)]);
    const error = (status: number) => { if (!response.destroyed && !response.headersSent) response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{"error":{"message":"Local request unavailable","type":"invalid_request_error"}}'); };
    try {
      const supplied = Buffer.from(request.headers.authorization ?? '');
      if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) return error(401);
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions' || request.headers.origin !== undefined
        || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return error(400);
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 20000 || signal.aborted) throw Error(); chunks.push(Buffer.from(chunk)); }
      const value = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!object(value) || value.model !== model || value.stream !== true || !Array.isArray(value.messages) || !value.messages.length
        || Buffer.byteLength(JSON.stringify({ messages: value.messages, tools: value.tools ?? [] }), 'utf8') > 10000
        || (value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.length !== 0)) || value.functions !== undefined
        || (value.tool_choice !== undefined && value.tool_choice !== 'none' && value.tool_choice !== 'auto')
        || value.messages.some((m: unknown) => !object(m) || !['system', 'user', 'assistant'].includes(m.role as string)
          || Object.keys(m).some(k => !['role', 'content'].includes(k)) || !(typeof m.content === 'string' && m.content.isWellFormed()
            || Array.isArray(m.content) && m.content.every((p: unknown) => object(p) && Object.keys(p).sort().join(',') === 'text,type' && p.type === 'text' && typeof p.text === 'string' && p.text.isWellFormed())))) return error(400);
      const messages = structuredClone(value.messages);
      const freeze = (item: unknown): void => {
        if (item && typeof item === 'object') { for (const child of Object.values(item)) freeze(child); Object.freeze(item); }
      };
      freeze(messages);
      const bodyHash = createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const binding = await options.authorize(bodyHash, messages);
      if (!binding || binding.kind !== 'main' || binding.bodyHash !== bodyHash
        || ![binding.owner, binding.rootRun, binding.session, binding.message, binding.step].every(v => typeof v === 'string' && v.length > 0 && v.length <= 512)) return error(403);
      const key = JSON.stringify([binding.owner, binding.rootRun, binding.session, binding.message, binding.step, binding.kind]);
      if (used.has(key) || claimed >= 1) return error(409);
      used.add(key); claimed++;
      if (signal.aborted || !await options.current(binding) || signal.aborted || !await options.reserve(binding)) return error(403);
      let beforeUsed = false, beforeAllowed = false;
      const beforeSend = async () => {
        if (beforeUsed) return false;
        beforeUsed = true;
        beforeAllowed = !signal.aborted && await options.current(binding) && !signal.aborted; return beforeAllowed;
      };
      const result = await options.complete(messages, beforeSend, signal);
      const u = result?.usage;
      if (!beforeUsed || !beforeAllowed || signal.aborted || !result || typeof result.content !== 'string' || !result.content.isWellFormed() || result.content.length > 10000
        || !u || !Number.isSafeInteger(u.inputTokens) || u.inputTokens < 0 || u.inputTokens > 11024
        || !Number.isSafeInteger(u.outputTokens) || u.outputTokens < 0 || u.outputTokens > 700
        || !Number.isSafeInteger(u.costNanoUsd) || u.costNanoUsd < 0 || u.costNanoUsd > 1597640) throw Error();
      await options.receipt(binding, u);
      if (signal.aborted || !await options.current(binding) || signal.aborted) throw Error();
      const id = 'chatcmpl-' + randomUUID(), created = Math.floor(Date.now() / 1000);
      const chunk = (delta: object, finish_reason: string | null = null) => JSON.stringify({ id, object: 'chat.completion.chunk', created, model, choices: [{ index: 0, delta, finish_reason }] });
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'close' });
      response.end('data: ' + chunk({ role: 'assistant', content: result.content }) + '\n\ndata: ' + chunk({}, 'stop') + '\n\ndata: [DONE]\n\n');
    } catch { error(503); }
    finally { controllers.delete(controller); request.removeListener('aborted', abort); }
  });
  server.requestTimeout = 60000; server.headersTimeout = 5000;
  return {
    async listen() { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); }); const address = server.address(); if (!address || typeof address === 'string') throw Error(); return 'http://127.0.0.1:' + address.port + '/v1'; },
    async close() { for (const controller of controllers) controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
