import type { ChatPresentation } from './chat-contracts.ts';

type PublicEvent = { type: 'text_delta'; text: string } | { type: 'text_reset' } | { type: 'tool_activity'; tool: 'rag_search' | 'web_search' | 'espressif_docs'; status: 'started' | 'completed' | 'failed' };

// Presentation has no execution authority. Coalesce native deltas while current access is checked.
export function createChatPresentation(authorize: () => Promise<boolean>, send: (event: PublicEvent) => void) {
  let closed = false, disabled = false, pending = '', draft = '', wireBytes = 0, textCount = 0;
  let working: Promise<void> | undefined;
  const emit = (event: PublicEvent) => { if (!closed) try { send(event); } catch { closed = true; pending = ''; } };
  const reset = () => { pending = ''; draft = ''; emit({ type: 'text_reset' }); };
  const pump = () => {
    if (working || !pending || closed || disabled) return;
    working = (async () => {
      while (pending && !closed && !disabled) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let allowed = false;
        try { allowed = await Promise.race([authorize(), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3000); })]); }
        catch { /* A failed current-access check discards only provisional presentation. */ }
        finally { clearTimeout(timer); }
        if (closed) return;
        if (allowed !== true) { disabled = true; reset(); return; }
        // No await between current authorization and this projection.
        let length = Math.min(pending.length, 4096);
        if (length < pending.length && /[\uD800-\uDBFF]/.test(pending[length - 1])) length--;
        const text = pending.slice(0, length); pending = pending.slice(length);
        if (text) emit({ type: 'text_delta', text });
      }
    })().catch(() => { disabled = true; reset(); }).finally(() => { working = undefined; pump(); });
  };
  const callbacks: ChatPresentation = {
    onText(text) {
      if (closed || disabled) return;
      if (typeof text !== 'string' || !text || !text.isWellFormed() || text.length > 4096) { disabled = true; reset(); return; }
      const next = draft + text;
      wireBytes += Buffer.byteLength(text, 'utf8');
      if (++textCount > 10000 || wireBytes > 256 * 1024 || next.length > 6000 || Buffer.byteLength(JSON.stringify({ outcome: 'conversation', text: next, citations: [] }), 'utf8') > 23000) { disabled = true; reset(); return; }
      draft = next; pending += text; pump();
    },
    onTextReset() { if (!closed) { if (++textCount > 10000) disabled = true; reset(); } },
  };
  return { callbacks, async drain() { while (working) await working; }, close() { closed = true; pending = ''; draft = ''; } };
}
