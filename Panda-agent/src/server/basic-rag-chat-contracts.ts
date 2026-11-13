import type { ActivityReporter } from './chat-contracts.ts';
import type { TurnUsage } from '../hosted-model.ts';
import type { TurnSink } from '../agent-loop/turn-events.ts';

export type BasicRagTurn = { thread: string; request: string; question: string; webSearch?: boolean };
export type BasicRagReference = Pick<BasicRagTurn, 'thread' | 'request'>;
export type BasicRagChatBridge = {
  state(thread: string, request: string): Promise<boolean>;
  /** `sink` receives the agent loop's live events: checklist, tool steps, compiled firmware (other bridges ignore it). */
  start(turn: BasicRagTurn, signal: AbortSignal, progress?: ActivityReporter, sink?: TurnSink): Promise<{ status: 'saved' | 'pending' | 'unknown'; usage?: TurnUsage; suggestions?: string[] }>;
  status(turn: BasicRagReference, signal: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
  cancel(turn: BasicRagReference, signal: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
};
