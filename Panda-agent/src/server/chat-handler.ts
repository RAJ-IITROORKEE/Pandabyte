import { resolveChatScope } from '../retrieval/chat-scope.ts';
import { conversationRoute, isUnscopedConversation } from '../retrieval/conversation-route.ts';
import { activityStages, uuid, type ActivityReporter, type ChatDependencies, type ChatRead } from './chat-contracts.ts';
import { ChatStoreError, cleanAnswer, createChatStore } from './chat-store.ts';
import { NativeNotAdmittedError, NativeCompletedFailureError } from './opencode-selector.ts';
import { isContextSummary } from '../retrieval/context-summary.ts';
import { createChatPresentation } from './chat-presentation.ts';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' } });
const failure = (status: number) => response({ error: status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 401 ? 'unauthenticated' : status === 429 ? 'quota' : status === 503 ? 'unavailable' : 'invalid' }, status);
const publicRead = ({ thread, messages }: ChatRead) => ({ thread, messages });
const validText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
async function body(request: Request): Promise<unknown> {
  if (!request.body) throw 400;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 8192) { await reader.cancel().catch(() => {}); throw 413; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw 400; }
  } finally { reader.releaseLock(); }
}
function errorStatus(e: unknown): number {
  if (typeof e === 'number' && [400, 403, 413, 415].includes(e)) return e;
  if (e instanceof ChatStoreError) return ({ not_found: 404, conflict: 409, invalid: 400, unauthenticated: 401, quota: 429, unavailable: 503 })[e.code];
  return 503;
}
export function createChatHandler(deps: ChatDependencies) {
  async function handle(request: Request, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', action: 'list' | 'create' | 'read' | 'message' | 'archive' | 'delete', id?: string): Promise<Response> {
    if (request.method !== method) return new Response(JSON.stringify({ error: 'invalid' }), { status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', Allow: method } });
    try {
      const actor = await deps.authenticate();
      if (!actor || !validText(actor.subject, 512) || !actor.client) return failure(401);
      const url = new URL(request.url);
      if (url.search && !(action === 'list' && url.search === '?archived=true')) return failure(400);
      if (['read', 'message', 'archive', 'delete'].includes(action) && !uuid(id)) return failure(400);
      let input: unknown;
      if (method !== 'GET' && request.headers.get('origin') !== url.origin) return failure(403);
      if (method === 'POST' || method === 'PATCH') {
        if (request.headers.get('origin') !== url.origin) return failure(403);
        if (!/^application\/json(?:\s*;\s*[^;]+)*\s*$/i.test(request.headers.get('content-type') ?? '')) return failure(415);
        input = await body(request);
        if (!obj(input)) return failure(400);
        if (action === 'create' && (Object.keys(input).some(k => k !== 'title') || (input.title !== undefined && !validText(input.title, 100)))) return failure(400);
        if (action === 'message' && (Object.keys(input).some(k => !['requestId', 'question', 'webSearch'].includes(k)) || !uuid(input.requestId) || !validText(input.question, 2000)
          || (input.webSearch !== undefined && typeof input.webSearch !== 'boolean') || (input.webSearch === true && input.question.trim().length > 400))) return failure(400);
        if (action === 'archive' && (Object.keys(input).length !== 1 || typeof input.archived !== 'boolean')) return failure(400);
      }
      if (method === 'DELETE' && request.body) {
        const reader = request.body.getReader();
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (part.value.byteLength) { await reader.cancel().catch(() => {}); return failure(400); }
          }
        } finally { reader.releaseLock(); }
      }
      const store = createChatStore(actor.client);
      if (action === 'list') return response(await store.list(url.search === '?archived=true'));
      if (action === 'create') return response(await store.create((input as { title?: string }).title?.trim() ?? 'New chat'), 201);
      if (action === 'read') return response(publicRead(await store.read(id!)));
      if (action === 'archive') return response(await store.archive(id!, (input as { archived: boolean }).archived));
      if (action === 'delete') return response(await store.delete(id!));
      const { question: rawQuestion, requestId: rawRequestId, webSearch = false } = input as { question: string; requestId: string; webSearch?: boolean };
      const requestId = rawRequestId.toLowerCase();
      const question = rawQuestion.trim();
      const currentAccess = async (stage: 'draft' | 'final') => {
        if (!deps.authorizePresentation) return true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { return await Promise.race([deps.authorizePresentation(actor, id!, requestId, stage), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]) === true; }
        catch { return false; }
        finally { clearTimeout(timer); }
      };
      await store.read(id!); // Verify ownership before any runtime or model work.
      if (request.signal.aborted) return failure(503);
      const start = await store.begin(id!, requestId, question, webSearch);
      if (start.turn.requestId !== requestId || start.turn.question !== question) throw new ChatStoreError('unavailable');
      if (!start.admitted) {
        if (start.turn.status === 'pending') return failure(409);
        return await currentAccess('final') ? response(publicRead(start)) : failure(401);
      }
      if (start.turn.status !== 'pending' || !start.finishToken) return failure(503);
      const finishToken = start.finishToken;
      const work = async (progress?: ActivityReporter, presentation?: ReturnType<typeof createChatPresentation>) => {
        if (!webSearch) progress?.('routing_question');
        const unscoped = !webSearch && isUnscopedConversation(question);
        const catalog = webSearch || unscoped ? [] : await deps.products(actor.client);
        let previous: string | undefined;
        for (const old of (unscoped ? [] : start.turns.filter(t => t.status === 'complete').slice(-12))) {
          const scope = resolveChatScope(old.question, catalog, previous);
          previous = scope.kind === 'resolved' ? scope.productSku : undefined;
        }
        const scope = conversationRoute(question, catalog, previous);
        const history = start.messages.slice(0, -1).slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 1800) }));
        let result;
        try { result = webSearch ? await deps.webSearch?.(question, request, progress)
          : scope.kind === 'resolved' ? await deps.answer(actor, { question, productSku: scope.productSku }, request, progress)
          : scope.kind === 'conversation' ? await deps.converse?.(history, question, request, progress, unscoped ? presentation?.callbacks : undefined)
          : scope.kind === 'manufacturer' ? await deps.manufacturer?.(question, request, progress)
          : { outcome: scope.kind, text: scope.text, citations: [] };
        } catch (error) {
          if (error instanceof NativeCompletedFailureError) {
            result = { outcome: 'insufficient', text: 'The agent finished but could not produce a validated answer. No automatic retry was made. You can rephrase the question and continue this chat.', citations: [] };
          } else {
            if (!(error instanceof NativeNotAdmittedError)) throw error;
            result = { outcome: 'insufficient', text: 'The agent runtime is busy or unavailable. This request did not start model work. You can send it again later.', citations: [] };
          }
        }
        if (!result) throw new ChatStoreError('unavailable');
        await presentation?.drain();
        progress?.('saving_answer');
        const saved = await store.finish(id!, requestId, finishToken, cleanAnswer(result));
        // Preserve a known terminal result, but revocation must also fence final history delivery.
        if (!await currentAccess('final')) throw new ChatStoreError('unauthenticated');
        return publicRead(saved);
      };
      if (!request.headers.get('accept')?.split(',').some(value => value.trim().split(';')[0].toLowerCase() === 'text/event-stream')) return response(await work());
      let closed = false;
      const seen = new Set<string>();
      let contextSent = false;
      let presentation: ReturnType<typeof createChatPresentation> | undefined;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (value: unknown) => {
            if (closed) return;
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); } catch { closed = true; }
          };
          if (deps.authorizePresentation) presentation = createChatPresentation(() => currentAccess('draft'), send);
          const progress: ActivityReporter = (stage, context) => {
            if (!activityStages.includes(stage)) return;
            if (stage === 'searching_sources' && !contextSent && isContextSummary(context)) {
              contextSent = true;
              const { fragments, characters, duplicatesRemoved, limitCharacters } = context;
              send({ type: 'context', fragments, characters, duplicatesRemoved, limitCharacters });
            }
            if (seen.has(stage)) return;
            seen.add(stage); send({ type: 'activity', stage });
          };
          void work(progress, presentation).then(data => send({ type: 'complete', data })).catch(e => {
            const status = errorStatus(e);
            const error = status === 409 ? 'conflict' : status === 401 ? 'unauthenticated' : status === 429 ? 'quota' : 'unavailable';
            send({ type: 'error', error });
          }).finally(() => { presentation?.close(); if (!closed) { closed = true; controller.close(); } });
        },
        cancel() { closed = true; presentation?.close(); },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store' } });
    } catch (e) { return failure(errorStatus(e)); }
  }
  return {
    listGET: (request: Request) => handle(request, 'GET', 'list'),
    createPOST: (request: Request) => handle(request, 'POST', 'create'),
    readGET: (request: Request, id: string) => handle(request, 'GET', 'read', id),
    messagePOST: (request: Request, id: string) => handle(request, 'POST', 'message', id),
    archivePATCH: (request: Request, id: string) => handle(request, 'PATCH', 'archive', id),
    deleteDELETE: (request: Request, id: string) => handle(request, 'DELETE', 'delete', id),
  };
}
