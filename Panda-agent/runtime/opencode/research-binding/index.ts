import { createHash } from 'node:crypto';
import { researchProfileSelection } from '../research-profile.mjs';

type ToolContext = { sessionID: string; messageID: string; id: string };
type MutableTool = { id: string; name: string; execute: (input: unknown, context: ToolContext) => unknown };
type HttpEvent = { sessionID: string; kind: string; request: Request };
type RetryEvent = { decision: { retry: boolean; delay?: number } };
type TitleEvent = { result?: string };
type CompactionEvent = { messages?: unknown; result?: { summary: string } };
type Context = {
  session: { hook: {
    (name: 'http.request', callback: (event: HttpEvent) => void): Promise<unknown>;
    (name: 'retry', callback: (event: RetryEvent) => void): Promise<unknown>;
    (name: 'title', callback: (event: TitleEvent) => void): Promise<unknown>;
    (name: 'compaction', callback: (event: CompactionEvent) => void): Promise<unknown>;
  } };
  tool: { transform: (callback: (editor: { list(): readonly MutableTool[]; update(id: string, callback: (tool: MutableTool) => void): void }) => void) => Promise<unknown> };
};
const validID = (value: unknown, prefix: string) => typeof value === 'string' && new RegExp(`^${prefix}_[a-zA-Z0-9]{26}$`).test(value);
const queryInput = (value: unknown): value is { query: string } => {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(fields).length !== 1 || !Object.hasOwn(fields, 'query') || !Object.hasOwn(fields.query, 'value')) return false;
  const query: unknown = fields.query.value;
  return typeof query === 'string' && query.isWellFormed() && [...query].length >= 1 && [...query].length <= 400 && !/[\u0000-\u001f\u007f-\u009f]/u.test(query);
};

// Memory: the host asks OpenCode to compact a long chat; this hook writes the summary, so compaction never calls a model
// (no extra cost, nothing for the guard to account). The summary keeps each earlier question with its final answer and
// drops search excerpts, which are the bulk of the history. OpenCode keeps the latest exchange beside it.
const prefaceEnd = '\n\nQuestion:\n', summaryMax = 6000;
const partsText = (content: unknown) => typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter(p => p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string').map(p => (p as { text: string }).text).join('') : '';
// Cuts by code point so a summary never ends in half a surrogate pair (the guard refuses ill-formed text).
const clip = (text: string, max: number) => { const t = [...text.replace(/\s+/g, ' ').trim()]; return t.length > max ? t.slice(0, max - 3).join('') + '...' : t.join(''); };
const finalAnswer = (text: string) => {
  const fence = /```json\n([\s\S]*)\n```\s*$/.exec(text), candidate = text.trimStart().startsWith('{') ? text : fence ? fence[1] : null;
  try { const v = candidate === null ? null : JSON.parse(candidate); return v && typeof v.answer === 'string' ? v.answer.replace(/\[S[12]\]/g, '') : null; } catch { return null; }
};
export function researchMemorySummary(messages: unknown): string {
  let earlier = ''; const turns: { q: string; a: string | null }[] = [];
  const add = (role: string, text: string) => {
    if (role === 'user') { const at = text.indexOf(prefaceEnd); turns.push({ q: at >= 0 ? text.slice(at + prefaceEnd.length) : text, a: null }); return; }
    const answer = finalAnswer(text); if (answer !== null && turns.length) turns[turns.length - 1].a = answer;
  };
  for (const m of Array.isArray(messages) ? messages.slice(-400) : []) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: unknown }).role, text = partsText((m as { content?: unknown }).content);
    if (role === 'user' && text.startsWith('<conversation-checkpoint>')) {
      // Greedy to the last closing tag, so a question that contains "</summary>" cannot cut the carried summary short.
      earlier = (/<summary>\n?([\s\S]*)\n?<\/summary>\s*<recent-context>/.exec(text) ?? /<summary>\n?([\s\S]*)\n?<\/summary>/.exec(text))?.[1] ?? earlier;
      const recent = /<recent-context>\n?([\s\S]*)\n?<\/recent-context>/.exec(text)?.[1] ?? '';
      for (const [, who, body] of recent.matchAll(/\[(User|Assistant)\]: ([\s\S]*?)(?=\n\n\[(?:User|Assistant)\]: |$)/g)) add(who === 'User' ? 'user' : 'assistant', body);
    } else if (role === 'user' || role === 'assistant') add(role, text);
  }
  const lines = turns.map(t => `Q: ${clip(t.q, 300)}\nA: ${t.a ? clip(t.a, 600) : '(no sourced answer)'}`);
  let body = ''; // newest first into the budget, then restored to chronological order
  for (let i = lines.length - 1; i >= 0 && body.length + lines[i].length + 2 <= summaryMax; i--) body = lines[i] + (body ? '\n\n' + body : '');
  const prior = earlier.replace(/^Earlier questions and answers in this chat[^\n]*\n\n?/, '').trim();
  const room = summaryMax - body.length;
  return 'Earlier questions and answers in this chat (their sources are not available now; search again before citing anything):\n\n'
    // An earlier summary keeps its newest lines when it no longer fits beside the new exchanges.
    + (prior && room > 200 ? (prior.length > room - 100 ? prior.slice(-(room - 100)).replace(/^[^\n]*\n/, '').toWellFormed() : prior) + '\n\n' : '') + (body || '(none)');
}

// A plain descriptor is the native Plugin.define result; use the host runtime without installing another Effect.
const researchBinding = {
  id: 'panda-research-binding',
  async setup(context: Context) {
    const selected = researchProfileSelection(process.env.PANDA_RESEARCH_PROFILE as Parameters<typeof researchProfileSelection>[0]);
    const generation = process.env.PANDA_RESEARCH_GENERATION;
    if (!/^[a-f0-9]{64}$/.test(generation ?? '')) throw Error('research_binding_invalid');
    await context.session.hook('http.request', event => {
      if (!validID(event.sessionID, 'ses') || !['primary', 'compaction', 'title', 'generate'].includes(event.kind)) throw Error('research_binding_invalid');
      const headers = new Headers(event.request.headers);
      headers.set('x-panda-native-session', event.sessionID);
      headers.set('x-panda-native-kind', event.kind);
      headers.set('x-panda-native-generation', generation!);
      event.request = new Request(event.request, { headers });
    });
    await context.session.hook('retry', event => { event.decision = { retry: false }; });
    await context.session.hook('title', event => { event.result = 'Panda research fixture'; });
    // An unexpected event shape sets no result: OpenCode then tries a model summary, which the guard refuses (non-primary kind).
    await context.session.hook('compaction', event => { if (Array.isArray(event.messages)) event.result = { summary: researchMemorySummary(event.messages) }; });
    await context.tool.transform(editor => {
      for (const entry of editor.list()) {
        if (entry.id !== selected.toolName) continue;
        editor.update(entry.id, tool => {
          const execute = tool.execute;
          tool.execute = (input, native) => {
            if (!queryInput(input) || !validID(native.sessionID, 'ses') || !validID(native.messageID, 'msg') || typeof native.id !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(native.id) || !native.id.trim()) throw Error('research_binding_invalid');
            const original = { query: input.query };
            const envelope = { sessionID: native.sessionID, assistantMessageID: native.messageID, toolID: native.id, generation,
              inputHash: createHash('sha256').update(JSON.stringify(original)).digest('hex') };
            return execute({ ...original, __pandaNative: envelope }, native);
          };
        });
      }
    });
  },
};
export default researchBinding;
