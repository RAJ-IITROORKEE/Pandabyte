import type { ActivityReporter } from './chat-contracts.ts';

export type BasicRagTurn = { thread: string; request: string; question: string; webSearch?: boolean };
export type BasicRagReference = Pick<BasicRagTurn, 'thread' | 'request'>;
export type BasicRagChatBridge = {
  state(thread: string, request: string): Promise<boolean>;
  start(turn: BasicRagTurn, signal: AbortSignal, progress?: ActivityReporter): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
  status(turn: BasicRagReference, signal: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
  cancel(turn: BasicRagReference, signal: AbortSignal): Promise<{ status: 'saved' | 'pending' | 'unknown' }>;
};
