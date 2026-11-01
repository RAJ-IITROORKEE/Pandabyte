import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createInsforgeServerClient } from '@/lib/insforge/server';
import { listRuntimeProducts } from '../retrieval/insforge-adapters';
import { localRetrievalAdapters } from './local-hybrid';
import { createAnswerHandler } from './answer-handler';
import { createChatHandler } from './chat-handler';
import { localRuntimeSelector, localRuntimeConversation, localRuntimeManufacturerSelector, localRuntimeWebSelector } from './local-runtime';
import { searchPublicWeb } from '../search/tavily';
import { publicSearchCitationUrl, webSearchSection } from '../search/citation-url';
import { findManufacturerSource, fetchManufacturerSource } from '../manufacturer/espressif';
import { NativeNotAdmittedError, NativeCompletedFailureError } from './opencode-selector';
import { createChatStore } from './chat-store';

// This adapter reuses the bounded quote selector; chat history never becomes evidence.
export const chatHandlers = createChatHandler({
  authenticate: async () => {
    const session = await auth();
    if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId) return null;
    return { subject: session.userId, sessionId: session.sessionId ?? undefined, client: await createInsforgeServerClient() };
  },
  ...(process.env.NODE_ENV !== 'production' && process.env.PANDA_AGENT_NATIVE_STREAMING_ENABLED === 'true' ? { authorizePresentation: async (actor: import('./chat-contracts').ChatActor, chatId: string, requestId: string, stage: 'draft' | 'final') => {
    if (!actor.sessionId) return false;
    const session = await (await clerkClient()).sessions.getSession(actor.sessionId);
    if (session.status !== 'active' || session.userId !== actor.subject) return false;
    const current = await createChatStore(actor.client).read(chatId);
    const status = stage === 'draft' ? 'pending' : 'complete';
    return current.thread.status === (stage === 'draft' ? 'pending' : 'idle') && current.turns.some(turn => turn.requestId === requestId && turn.status === status);
  } } : {}),
  products: listRuntimeProducts,
  webSearch: async (question, request, progress) => {
    if (process.env.NODE_ENV === 'production' || process.env.PANDA_AGENT_TAVILY_ENABLED !== 'true' || !process.env.TAVILY_API_KEY?.trim()) {
      return { outcome: 'insufficient', text: 'Web search is not configured yet. Turn Web search off to continue general chat or ask about PandaByte products.', citations: [] };
    }
    const select = await localRuntimeWebSelector(progress);
    if (!select || request.signal.aborted) throw new NativeNotAdmittedError();
    let sources;
    progress?.('searching_web');
    try { sources = await searchPublicWeb(question, { apiKey: process.env.TAVILY_API_KEY ?? '', enabled: process.env.PANDA_AGENT_TAVILY_ENABLED === 'true', freeOnly: true }); }
    catch { return { outcome: 'insufficient', text: 'Web search could not complete. Check that the question is public, the search key is configured and the local search quota is available. No automatic retry was made.', citations: [] }; }
    if (!sources.length) return { outcome: 'insufficient', text: 'Web search returned no usable public HTTPS sources for this question.', citations: [] };
    if (request.signal.aborted) return { outcome: 'insufficient', text: 'Web search finished after the request ended. No model request was started; you can search again when ready.', citations: [] };
    const result = await select(question, sources.map(source => ({ handle: source.handle, text: source.content })));
    progress?.('checking_citations');
    const quoted = new Map<string, number>();
    const citations = result.selections.map((selection, index) => {
      const source = sources.find(item => item.handle === selection.handle && item.content.includes(selection.quote));
      if (!source || !publicSearchCitationUrl(source.url)) throw new Error('Unbound search citation');
      const words = (quoted.get(source.url) ?? 0) + selection.quote.trim().split(/\s+/).length;
      if (words > 25) throw new Error('Search quotation limit');
      quoted.set(source.url, words);
      return { id: `S${index + 1}`, title: source.title, sourceUrl: source.url, capturedAt: source.capturedAt, quote: selection.quote, sectionPath: [webSearchSection] };
    });
    return { outcome: 'evidence', text: `Web search excerpts:\n\n${citations.map(c => `${c.quote} [${c.id}]`).join('\n\n')}\n\nThese excerpts came from search results. Check the linked page and documentation version before applying technical instructions.`, citations };
  },
  converse: async (history, question, request, progress, presentation) => {
    const converse = await localRuntimeConversation(progress, presentation);
    if (!converse || request.signal.aborted) throw new NativeNotAdmittedError();
    return { outcome: 'conversation', text: await converse([...history], question), citations: [] };
  },
  manufacturer: async (question, request, progress) => {
    const descriptor = findManufacturerSource(question);
    if (!descriptor) return { outcome: 'clarification', text: 'Which Espressif chip do you mean? Official lookup currently supports ESP8266, ESP32, ESP32-C3, ESP32-C6 and ESP32-S3.', citations: [] };
    progress?.('reading_sources');
    let source;
    try { source = await fetchManufacturerSource(descriptor, undefined, question); }
    catch { return { outcome: 'insufficient', text: 'The official Espressif source is unavailable right now. I have not verified an answer; please try again later.', citations: [] }; }
    const select = await localRuntimeManufacturerSelector(progress);
    if (!select || request.signal.aborted) throw new NativeNotAdmittedError();
    const result = await select(question, source.fragments);
    progress?.('checking_citations');
    let words = 0;
    const citations = result.selections.map((selection, index) => {
      if (!source.fragments.some(fragment => fragment.handle === selection.handle && fragment.text.includes(selection.quote))) throw new Error('Unbound manufacturer quote');
      words += selection.quote.trim().split(/\s+/).length;
      if (words > 25) throw new Error('Manufacturer quotation limit');
      return { id: `S${index + 1}`, title: source.title, sourceUrl: source.sourceUrl, capturedAt: source.capturedAt, quote: selection.quote, sectionPath: ['Official chip documentation'] };
    });
    return { outcome: 'evidence', text: `Official Espressif documentation:\n\n${citations.map(c => `> ${c.quote} [${c.id}]`).join('\n\n')}\n\nThis describes the chip, not a verified PandaByte board connection or hardware test.`, citations };
  },
  answer: async (actor, input, request, progress) => {
    let knownFailure: NativeNotAdmittedError | NativeCompletedFailureError | undefined;
    const select = await localRuntimeSelector(progress);
    if (!select) throw new NativeNotAdmittedError();
    const handler = createAnswerHandler(async () => actor, async () => localRetrievalAdapters(actor.client, async (question, fragments) => {
      if (request.signal.aborted) { knownFailure = new NativeNotAdmittedError(); throw knownFailure; }
      try { return await select(question, fragments); }
      catch (error) { if (error instanceof NativeNotAdmittedError || error instanceof NativeCompletedFailureError) knownFailure = error; throw error; }
    }, progress));
    const result = await handler(new Request(new URL('/api/panda-agent/answer', request.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(request.url).origin },
      body: JSON.stringify(input), signal: request.signal,
    }));
    if (knownFailure) throw knownFailure;
    if (!result.ok) return null;
    const value = await result.json();
    if (!['evidence', 'clarification', 'insufficient', 'conflict'].includes(value.outcome)) return null;
    return { outcome: value.outcome, text: value.text, citations: value.citations };
  },
});
