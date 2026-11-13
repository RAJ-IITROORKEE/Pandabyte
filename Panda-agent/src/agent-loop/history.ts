// Same-chat history for the agent loop. Every completed answer the masked chat read still shows is context,
// including cited product answers; none of it is evidence. Older turns are compacted once the prompt passes
// 75% of the context budget: recent turns stay verbatim, older ones become one-line digests.
import type { ChatRead } from '../server/chat-contracts.ts';

export type HistoryMessage = { role: 'user' | 'assistant'; content: string };
export type LoopHistory = { messages: HistoryMessage[]; summary: string | null; compacted: boolean };
/** Request wire cap: at 2 bytes per token (code, escaped JSON, Indic scripts) it stays under the 24k-token step bound; every hosted endpoint offers at least 131k. */
export const CONTEXT_BYTES = 48000, COMPACT_AT = 0.75, KEEP_VERBATIM = 3;

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const clip = (s: string, max: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…'; };
const plain = (s: string) => s.replace(/```[\s\S]*?```/g, ' [code] ').replace(/[#*_`>|]/g, ' ');

type Pair = { question: string; answer: string; cited: string[] };
function pairs(read: ChatRead, request: string): Pair[] {
  const boundary = read.turns.findIndex(t => t.requestId === request);
  return (boundary < 0 ? read.turns : read.turns.slice(0, boundary)).flatMap(t => {
    const r = t.response;
    if (t.status !== 'complete' || !r || !['conversation', 'evidence', 'clarification'].includes(r.outcome)) return [];
    const cited = [...new Set(r.citations.map(c => c.title))];
    return [{ question: t.question, answer: r.text.replace(/ ?\[S\d{1,2}\]/g, '').trim(), cited }];
  });
}
const verbatim = (p: Pair): HistoryMessage[] => [{ role: 'user', content: p.question },
  { role: 'assistant', content: p.cited.length ? `${p.answer}\n\n(That answer cited PandaByte sources: ${p.cited.join('; ')}. It is not evidence now; read the product again before citing it.)` : p.answer }];
const digest = (p: Pair) => `- User: ${clip(p.question, 200)} | Assistant: ${clip(plain(p.answer), 240)}${p.cited.length ? ` | cited: ${clip(p.cited.join('; '), 160)}` : ''}`;

/** `fixedBytes` is everything else in the first request (system prompt, tool schemas, the new question). */
// shortcut: older turns become deterministic digests, not a model-written summary; upgrade if long project chats lose detail.
export function loopHistory(read: ChatRead, request: string, fixedBytes: number, budget = CONTEXT_BYTES): LoopHistory {
  const all = pairs(read, request), limit = Math.floor(budget * COMPACT_AT);
  const size = (keep: Pair[], lines: string[]) => fixedBytes + bytes(keep.flatMap(verbatim)) + (lines.length ? bytes(lines.join('\n')) + 120 : 0);
  if (size(all, []) <= limit) return { messages: all.flatMap(verbatim), summary: null, compacted: false };
  let keep = all.slice(-KEEP_VERBATIM), lines = all.slice(0, all.length - keep.length).map(digest);
  while (size(keep, lines) > limit && keep.length > 1) { lines.push(digest(keep[0])); keep = keep.slice(1); }
  while (size(keep, lines) > limit && lines.length) lines = lines.slice(1);
  // A single huge last answer (a long code listing) is clipped rather than dropped: the follow-up usually refers to it.
  if (size(keep, lines) > limit && keep.length) keep = [{ ...keep[0], answer: keep[0].answer.slice(0, Math.max(500, Math.floor((limit - fixedBytes - bytes(keep[0].question)) / 2))).trimEnd() + '\n…(clipped)' }];
  return { messages: keep.flatMap(verbatim), summary: lines.length ? lines.join('\n') : null, compacted: true };
}
