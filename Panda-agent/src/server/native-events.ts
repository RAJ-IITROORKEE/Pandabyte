export type TextObserver = { reconcile(output: string): void; close(): void };
type Options = { endpoint: string; authorization: string; fetcher: typeof fetch; sessionID: string; deadline: number; onText: (delta: string) => void; onTextReset?: () => void };

// Presentation failures must never change admission, execution or cleanup.
export async function observeNativeText(o: Options): Promise<TextObserver> {
    const abort = new AbortController();
    let stopped = false, invalid = false, started = false, message = '', ordinal = -1, active = false;
    let part = '', draft = '', count = 0, bytes = 0, buffer = '', emitted = false;
    const ids = new Set<string>();
    const reset = () => { if (!invalid) { invalid = true; if (emitted) try { o.onTextReset?.(); } catch {} } };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const close = () => { stopped = true; abort.abort(); void reader?.cancel().catch(() => {}); };
    const observer = { close, reconcile(output: string) { if (emitted && (invalid || active || draft !== output)) reset(); } };
    const timer = setTimeout(() => { reset(); close(); }, Math.max(1, o.deadline - Date.now()));
    abort.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    try {
        const query = new URLSearchParams();
        ['session.execution.started', 'session.text.started', 'session.text.delta', 'session.text.ended'].forEach(t => query.append('types', t));
        let connectTimer: ReturnType<typeof setTimeout> | undefined;
        const response = await Promise.race([
            o.fetcher(`${o.endpoint}/api/event?${query}`, { method: 'GET', headers: { Authorization: o.authorization, Accept: 'text/event-stream', Connection: 'close' }, redirect: 'error', cache: 'no-store', signal: abort.signal }),
            new Promise<never>((_, reject) => { connectTimer = setTimeout(() => { abort.abort(); reject(Error()); }, 3000); }),
        ]).finally(() => clearTimeout(connectTimer));
        if (response.status !== 200 || !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw Error();
        reader = response.body.getReader();
        const eventReader = reader;
        let readyResolve!: (ok: boolean) => void;
        const ready = new Promise<boolean>(resolve => { readyResolve = resolve; });
        let readyDone = false;
        const readyOnce = (ok: boolean) => { if (!readyDone) { readyDone = true; readyResolve(ok); } };
        const frame = (raw: string) => {
            const data = raw.split(/\r\n|\r|\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
            if (!data) return;
            const e = JSON.parse(data) as Record<string, unknown>;
            if (e.type === 'server.connected') { readyOnce(true); return; }
            if (!e.data || typeof e.data !== 'object' || Array.isArray(e.data)) throw Error();
            const d = e.data as Record<string, unknown>;
            if (d.sessionID !== o.sessionID || invalid) return;
            if (typeof e.id !== 'string' || !e.id || e.id.length > 256 || ids.has(e.id) || ++count > 10000) { reset(); return; }
            ids.add(e.id);
            if (e.type === 'session.execution.started') { if (started) reset(); else started = true; return; }
            if (!['session.text.started', 'session.text.delta', 'session.text.ended'].includes(String(e.type))) return;
            if (!started || typeof d.assistantMessageID !== 'string' || !/^msg_[0-9a-f]{12}[A-Za-z0-9]{14}$/.test(d.assistantMessageID) || !Number.isSafeInteger(d.ordinal) || (d.ordinal as number) < 0) { reset(); return; }
            if (e.type === 'session.text.started') {
                if (active || (message && message !== d.assistantMessageID) || (d.ordinal as number) <= ordinal) { reset(); return; }
                message = d.assistantMessageID; ordinal = d.ordinal as number; active = true; part = ''; return;
            }
            if (!active || message !== d.assistantMessageID || ordinal !== d.ordinal) { reset(); return; }
            if (e.type === 'session.text.ended') { if (typeof d.text !== 'string' || d.text !== part) reset(); active = false; return; }
            if (typeof d.delta !== 'string' || !d.delta || /[\uD800-\uDFFF]/u.test(d.delta.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))) { reset(); return; }
            const next = draft + d.delta;
            if (next.length > 6000 || Buffer.byteLength(JSON.stringify({ outcome: 'conversation', text: next, citations: [] }), 'utf8') > 23000) { reset(); return; }
            part += d.delta; draft = next; emitted = true;
            try { o.onText(d.delta); } catch { reset(); }
        };
        void (async () => {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            try {
                while (!stopped) {
                    const item = await eventReader.read();
                    if (item.done) { if (!stopped) reset(); break; }
                    bytes += item.value.byteLength;
                    if (bytes > 1048576) throw Error();
                    buffer += decoder.decode(item.value, { stream: true });
                    if (buffer.length > 65536) throw Error();
                    let match: RegExpExecArray | null;
                    while ((match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
                        const value = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length); frame(value);
                    }
                }
            } catch { if (!stopped) reset(); } finally { readyOnce(false); try { eventReader.releaseLock(); } catch {} }
        })();
        let readyTimer: ReturnType<typeof setTimeout> | undefined;
        const connected = await Promise.race([ready, new Promise<boolean>(resolve => { readyTimer = setTimeout(() => resolve(false), 3000); })]).finally(() => clearTimeout(readyTimer));
        if (!connected) { reset(); close(); }
    } catch { reset(); close(); }
    return observer;
}
