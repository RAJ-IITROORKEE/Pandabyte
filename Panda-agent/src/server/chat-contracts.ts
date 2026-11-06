import type { InsForgeClient } from '@insforge/sdk';
import type { Citation } from '../retrieval/contracts.ts';
import type { VendorCitation } from '../diagnostics/contracts.ts';
import type { ContextSummary } from '../retrieval/context-summary.ts';
import type {ProjectMemory} from '../guide/contracts.ts';
import type {ToolActivity} from '../agentic/contracts.ts';

export const activityStages = ['routing_question', 'resolving_product', 'reading_sources', 'searching_sources', 'searching_web', 'selecting_evidence', 'checking_citations', 'saving_answer'] as const;
export type ActivityStage = typeof activityStages[number];
export type ActivityReporter = (stage: ActivityStage, context?: ContextSummary,tool?:ToolActivity) => void;

export type ChatCitation = Citation | VendorCitation;
export type ChatAnswer = { outcome: 'evidence' | 'conversation' | 'clarification' | 'insufficient' | 'conflict'; text: string; citations: ChatCitation[] };
export type ChatActor = { subject: string; client: InsForgeClient; sessionId?: string };
export type ChatThread = { id: string; title: string; updatedAt: string; status: 'idle' | 'pending' | 'blocked'; archivedAt?: string | null };
export type ToolCard={toolId:'panda_scoped_rag'|'fetch_public_docs_mcp'|'convert_units'|'format_bom';state:'complete'|'unknown'};
export type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; citations: ChatCitation[];toolCards?:ToolCard[];terminalReason?:'answered'|'clarification'|'insufficient'|'unavailable'|'budget_exhausted'|'cancelled' };
export type ChatTurn = { requestId: string; question: string; status: 'pending' | 'complete'; response: ChatAnswer | null; createdAt: string;workflow?:'agentic' };
export type ChatRead = { thread: ChatThread; messages: ChatMessage[]; turns: ChatTurn[]; projectMemory?:ProjectMemory };
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
