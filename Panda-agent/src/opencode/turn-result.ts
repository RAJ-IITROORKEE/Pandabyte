import { createHash } from 'node:crypto';
import type { NativeMessage, NativeSessionState } from './session-contracts.ts';

export type NativeTurnResult =
    | { state: 'pending' | 'unknown' }
    | { state: 'terminal'; outcome: 'failed' | 'interrupted' }
    | { state: 'terminal'; outcome: 'succeeded'; serializedAnswer: string };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const time = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const outcomes = ['succeeded', 'failed', 'interrupted'];
const id = (value: unknown): value is string => typeof value === 'string' && /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(value);

/** Private correlation only. The caller still validates JSON/evidence, ownership, current grants and persistence. */
export function correlateNativeTurn(
    expected: { messageID: string; promptHash: string },
    session: NativeSessionState,
    active: boolean,
    messages: readonly NativeMessage[],
): NativeTurnResult {
    const unknown: NativeTurnResult = { state: 'unknown' };
    if (!record(expected) || !id(expected.messageID) || typeof expected.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(expected.promptHash)
        || !record(session) || !record(session.time) || typeof active !== 'boolean' || !time(session.time.created) || !time(session.time.updated)
        || (session.outcome !== undefined && !outcomes.includes(session.outcome)) || !Array.isArray(messages) || messages.length > 100) return unknown;
    const seen = new Set<string>();
    let previous = -1;
    for (const message of messages) {
        if (!record(message) || !id(message.id) || seen.has(message.id) || !time(message.created) || message.created < previous
            || typeof message.type !== 'string' || !['user', 'assistant', 'idle', 'activity'].includes(message.type)) return unknown;
        seen.add(message.id); previous = message.created;
    }
    if (active || session.outcome === undefined) return { state: 'pending' };
    const users = messages.filter(message => message.type === 'user');
    if (users.length !== 1) return unknown;
    const user = users[0];
    if (user.id !== expected.messageID || typeof user.text !== 'string' || !user.text.isWellFormed() || Buffer.byteLength(user.text, 'utf8') > 98304
        || createHash('sha256').update(user.text, 'utf8').digest('hex') !== expected.promptHash) return unknown;
    const start = messages.indexOf(user);
    // A one-prompt session has no earlier assistant/idle receipt that could satisfy this turn.
    if (messages.slice(0, start).some(message => message.type !== 'activity')) return unknown;
    const idle = messages.at(-1);
    // Native 2.2.2 starts execution before promoting the inbox user; a later busy period cannot settle this prompt.
    if (idle?.type !== 'idle' || idle.outcome !== session.outcome || idle.created < user.created
        || !time(session.time.busy) || !time(session.time.idle) || session.time.busy < session.time.created || session.time.busy > user.created || session.time.idle < session.time.busy
        || idle.created < session.time.busy || idle.created > session.time.idle || messages.slice(start + 1, -1).some(message => message.type === 'idle')) return unknown;
    if (session.outcome === 'failed' || session.outcome === 'interrupted') return { state: 'terminal', outcome: session.outcome };
    const assistants = messages.slice(start + 1, -1).filter(message => message.type === 'assistant');
    // This first context-fed increment denies tools and admits one prompt; multi-step output needs a separate correlation contract.
    if (assistants.length !== 1) return unknown;
    const assistant = assistants[0];
    if (assistant.failed !== false || assistant.retrying !== false || !time(assistant.completed) || assistant.completed < assistant.created
        || assistant.created < user.created || assistant.completed > idle.created || assistant.completed > session.time.idle
        || typeof assistant.text !== 'string' || !assistant.text.trim() || !assistant.text.isWellFormed() || Buffer.byteLength(assistant.text, 'utf8') > 24000) return unknown;
    return { state: 'terminal', outcome: 'succeeded', serializedAnswer: assistant.text };
}
