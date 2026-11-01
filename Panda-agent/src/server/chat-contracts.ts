import type { InsForgeClient } from '@insforge/sdk';
import type { Citation, Question } from '../retrieval/contracts.ts';
import type { ChatScopeProduct } from '../retrieval/chat-scope.ts';
import type { ContextSummary } from '../retrieval/context-summary.ts';

export const activityStages = ['routing_question', 'resolving_product', 'reading_sources', 'searching_sources', 'searching_web', 'opencode_queued', 'opencode_working', 'checking_citations', 'saving_answer'] as const;
export type ActivityStage = typeof activityStages[number];
export type ActivityReporter = (stage: ActivityStage, context?: ContextSummary) => void;
export type ChatPresentation = { onText(text: string): void; onTextReset(): void };

export type ChatAnswer = { outcome: 'evidence' | 'conversation' | 'clarification' | 'insufficient' | 'conflict'; text: string; citations: Citation[] };
export type ChatActor = { subject: string; client: InsForgeClient; sessionId?: string };
export type ChatDependencies = {
  authenticate(): Promise<ChatActor | null>;
  products(client: InsForgeClient): Promise<readonly ChatScopeProduct[]>;
  answer(actor: ChatActor, question: Question, request: Request, progress?: ActivityReporter): Promise<ChatAnswer | null>;
  converse?(history: readonly Pick<ChatMessage, 'role' | 'text'>[], question: string, request: Request, progress?: ActivityReporter, presentation?: ChatPresentation): Promise<ChatAnswer | null>;
  authorizePresentation?(actor: ChatActor, chatId: string, requestId: string, stage: 'draft' | 'final'): Promise<boolean>;
  manufacturer?(question: string, request: Request, progress?: ActivityReporter): Promise<ChatAnswer | null>;
  webSearch?(question: string, request: Request, progress?: ActivityReporter): Promise<ChatAnswer | null>;
};
export type ChatThread = { id: string; title: string; updatedAt: string; status: 'idle' | 'pending' | 'blocked'; archivedAt?: string | null };
export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; citations: Citation[] };
export type ChatTurn = { requestId: string; question: string; status: 'pending' | 'complete'; response: ChatAnswer | null; createdAt: string };
export type ChatRead = { thread: ChatThread; messages: ChatMessage[]; turns: ChatTurn[] };
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
