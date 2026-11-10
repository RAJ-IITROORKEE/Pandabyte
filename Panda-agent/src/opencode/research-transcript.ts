import { createHash } from 'node:crypto';
import { researchJSON, researchObject, researchText, type ResearchObject } from './research-values.ts';

export type ResearchTodo = { content: string; status: 'pending' | 'in_progress' | 'completed' | 'cancelled' };
export type ResearchTool = { assistantMessageID: string; id: string; name: string; status: 'completed' | 'error';
 input: ResearchObject; content: string[]; time: { created: number; ran?: number; completed: number } };
export type ResearchCompaction = { id: string; status: 'completed'; reason: 'auto' | 'manual'; created: number };
export type ResearchTurnResult = { state: 'pending' | 'unknown' }
 | { state: 'terminal'; outcome: 'failed' | 'interrupted' }
 | { state: 'terminal'; outcome: 'succeeded'; text: string; tools: ResearchTool[]; compactions: ResearchCompaction[]; todos: ResearchTodo[] };
const id = (v: unknown): v is string => typeof v === 'string' && /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(v);
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const byteText = (v: unknown, max: number): v is string => typeof v === 'string' && v.isWellFormed() && Buffer.byteLength(v, 'utf8') <= max;
const callID = (v: unknown): v is string => typeof v === 'string' && /^[\x20-\x7e]{1,256}$/.test(v) && !!v.trim();
const baseTypes = new Set(['user', 'assistant', 'idle', 'compaction', 'synthetic', 'system', 'skill', 'shell', 'agent-switched', 'model-switched', 'location-switched']);
const unknown = (): ResearchTurnResult => ({ state: 'unknown' });
function todos(value: unknown): ResearchTodo[] | null {
 if (!Array.isArray(value) || value.length > 20) return null;
 const result: ResearchTodo[] = [];
 for (const item of value) {
  if (!researchObject(item) || Object.keys(item).sort().join(',') !== 'content,status' || !researchText(item.content, 500) || !item.content.trim()
   || !['pending', 'in_progress', 'completed', 'cancelled'].includes(item.status as string)) return null;
  result.push({ content: item.content, status: item.status as ResearchTodo['status'] });
 }
 return result;
}

/** Private native projection only; source receipts, ownership and provider settlement are separate authorities. */
export function projectResearchTurn(expected: unknown, session: unknown, active: unknown, messages: unknown, allowedTools: readonly string[]): ResearchTurnResult {
 if (!researchJSON({ expected, session, active, messages, allowedTools }, 1048576) || !researchObject(expected)
  || Object.keys(expected).sort().join(',') !== 'messageID,promptHash' || !id(expected.messageID)
  || typeof expected.promptHash !== 'string' || !/^[a-f0-9]{64}$/.test(expected.promptHash)
  || !researchObject(session) || !researchObject(session.time) || typeof active !== 'boolean'
  || !time(session.time.created) || !time(session.time.updated) || session.time.updated < session.time.created
  || (session.time.busy !== undefined && !time(session.time.busy)) || (session.time.idle !== undefined && !time(session.time.idle))
  || (session.outcome !== undefined && !['succeeded', 'failed', 'interrupted'].includes(session.outcome as string))
  || !Array.isArray(messages) || messages.length > 200 || !Array.isArray(allowedTools) || allowedTools.length > 16
  || allowedTools.some(t => typeof t !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(t)) || new Set(allowedTools).size !== allowedTools.length) return unknown();
 const rows: Record<string, unknown>[] = [], seen = new Set<string>(); let previous = -1;
 for (const value of messages) {
  if (!researchObject(value) || !id(value.id) || seen.has(value.id) || typeof value.type !== 'string' || !baseTypes.has(value.type)
   || !researchObject(value.time) || !time(value.time.created) || value.time.created < previous || value.time.created < session.time.created) return unknown();
  seen.add(value.id); previous = value.time.created; rows.push(value);
 }
 const start = rows.findIndex(m => m.id === expected.messageID);
 if (start < 0) return active || session.outcome === undefined ? { state: 'pending' } : unknown();
 const user = rows[start];
 if (user.type !== 'user' || !byteText(user.text, 98304) || createHash('sha256').update(user.text, 'utf8').digest('hex') !== expected.promptHash) return unknown();
 const suffix = rows.slice(start + 1), assistants: { row: Record<string, unknown>; text: string; toolCount: number }[] = [];
 const projected: ResearchTool[] = [], compactions: ResearchCompaction[] = [], toolKeys = new Set<string>();
 const toolTimes: { created: number; ran?: number; completed?: number }[] = [];
 let unresolved = false, invalidTodos = false, latestTodoTime = -1, latestTodos: ResearchTodo[] = [];
 for (const row of suffix) {
  const stamp = (row.time as Record<string, unknown>).created as number;
  if (row.type === 'idle') { if (!['succeeded', 'failed', 'interrupted'].includes(row.outcome as string)) return unknown(); continue; }
  if (row.type === 'compaction') {
   if (!['running', 'completed', 'failed'].includes(row.status as string) || !['auto', 'manual'].includes(row.reason as string) || !byteText(row.summary ?? '', 24000)) return unknown();
   if (row.status !== 'completed') unresolved = true;
   else compactions.push({ id: row.id as string, status: 'completed', reason: row.reason as 'auto' | 'manual', created: stamp });
   continue;
  }
  if (row.type === 'synthetic' || row.type === 'system' || row.type === 'skill') {
   if (!byteText(row.text, 24000) || row.type === 'skill' && (!researchText(row.skill, 256) || !researchText(row.name, 256))) return unknown();
   continue;
  }
  if (row.type !== 'assistant' || !Array.isArray(row.content) || row.content.length > 128) return unknown();
  const lifetime = row.time as Record<string, unknown>;
  if (lifetime.completed !== undefined && (!time(lifetime.completed) || lifetime.completed < stamp)) return unknown();
  let text = '', toolCount = 0;
  for (const part of row.content) {
   if (!researchObject(part)) return unknown();
   if (part.type === 'text' || part.type === 'reasoning') {
    if (!byteText(part.text, 24000)) return unknown();
    if (part.type === 'text') text += part.text;
    continue;
   }
   if (part.type !== 'tool' || !callID(part.id) || typeof part.name !== 'string' || !allowedTools.includes(part.name)
    || !researchObject(part.state) || !researchObject(part.time)) return unknown();
   toolCount++;
   const key = JSON.stringify([row.id, part.id]); if (toolKeys.has(key) || toolKeys.size >= 16) return unknown(); toolKeys.add(key);
   const s = part.state, t = part.time, settled = s.status === 'completed' || s.status === 'error';
   if (!['streaming', 'running', 'completed', 'error'].includes(s.status as string) || !time(t.created) || t.created < stamp
    || (t.ran !== undefined && (!time(t.ran) || t.ran < t.created))
    || (t.completed !== undefined && (!time(t.completed) || t.completed < (t.ran as number ?? t.created)))
    || (lifetime.completed !== undefined && (t.created > (lifetime.completed as number) || t.ran !== undefined && (t.ran as number) > (lifetime.completed as number)
     || t.completed !== undefined && (t.completed as number) > (lifetime.completed as number)))) return unknown();
   if (s.status === 'streaming' ? !byteText(s.input, 24000) : !researchObject(s.input) || !researchJSON(s.input, 24000, 12, 128)) return unknown();
   if (settled && !time(t.completed)) return unknown();
   toolTimes.push({ created: t.created, ...(t.ran === undefined ? {} : { ran: t.ran as number }), ...(t.completed === undefined ? {} : { completed: t.completed as number }) });
   let content: string[] = [];
   if (s.content !== undefined) {
    if (!Array.isArray(s.content) || s.content.length < 1 || s.content.length > 32) return unknown();
    for (const item of s.content) { if (!researchObject(item) || Object.keys(item).sort().join(',') !== 'text,type' || item.type !== 'text' || !byteText(item.text, 24000)) return unknown(); content.push(item.text); }
    if (!byteText(content.join(''), 24000)) return unknown();
   }
   if (s.status === 'completed' && !content.length) return unknown();
   if (!settled) { unresolved = true; continue; }
   if (s.status === 'error') content = [];
   projected.push({ assistantMessageID: row.id as string, id: part.id, name: part.name, status: s.status as 'completed' | 'error', input: structuredClone(s.input) as ResearchObject,
    content, time: { created: t.created, ...(t.ran === undefined ? {} : { ran: t.ran as number }), completed: t.completed as number } });
   if (s.status === 'completed' && part.name === 'todowrite') {
    const parsed = researchObject(s.metadata) ? todos(s.metadata.todos) : null;
    if (!parsed) invalidTodos = true;
    else if ((t.completed as number) >= latestTodoTime) { latestTodoTime = t.completed as number; latestTodos = parsed; }
   }
  }
  if (!byteText(text, 24000)) return unknown();
  assistants.push({ row, text, toolCount });
 }
 if (active || session.outcome === undefined) return { state: 'pending' };
 const idle = suffix.at(-1), clock = session.time;
 const created = clock.created, updated = clock.updated, busy = clock.busy, idleTime = clock.idle;
 if (!idle || idle.type !== 'idle' || idle.outcome !== session.outcome || suffix.slice(0, -1).some(m => m.type === 'idle')
  || !time(created) || !time(updated) || !time(busy) || !time(idleTime) || busy < created || idleTime < busy
  || (idle.time as Record<string, unknown>).created as number > idleTime || (user.time as Record<string, unknown>).created as number > Math.min(idleTime,updated)
  // Native idle advances its own clock after the last work update.
  || suffix.some(m => (m.time as Record<string, unknown>).created as number > (m.type==='idle'?idleTime:Math.min(idleTime,updated)))
  || assistants.some(a => (a.row.time as Record<string, unknown>).completed !== undefined && ((a.row.time as Record<string, unknown>).completed as number) > Math.min(idleTime,updated))) return unknown();
 const idleCreated = (idle.time as Record<string, unknown>).created as number;
 if (idleCreated < busy || toolTimes.some(t => Object.values(t).some(value => value > idleCreated))
  || assistants.some(a => (a.row.time as Record<string, unknown>).completed !== undefined && ((a.row.time as Record<string, unknown>).completed as number) > idleCreated)) return unknown();
 if (session.outcome === 'failed' || session.outcome === 'interrupted') return { state: 'terminal', outcome: session.outcome };
 const last = assistants.at(-1);
 if (unresolved || invalidTodos || !last || last.toolCount || last.row.finish !== 'stop' || !last.text.trim()
  || assistants.some(a => a.row.error !== undefined || a.row.retry !== undefined || !time((a.row.time as Record<string, unknown>).completed))) return unknown();
 return { state: 'terminal', outcome: 'succeeded', text: last.text, tools: projected, compactions, todos: latestTodos };
}
