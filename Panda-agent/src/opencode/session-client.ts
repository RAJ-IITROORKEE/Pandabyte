import { isAbsolute } from 'node:path';
import { NativeSessionError, type NativeAccessCheck, type NativeMessage, type NativeSessionReceipt, type NativeSessionState } from './session-contracts.ts';

const maxBytes = 1_000_000;
const sessionID = /^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/;
const messageID = /^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireValue(value: unknown): asserts value { if (!value) throw new NativeSessionError(); }
function object(value: unknown) { requireValue(record(value)); return value; }
const finiteTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max;
const outcome = (value: unknown): value is NonNullable<NativeSessionState['outcome']> => value === 'succeeded' || value === 'failed' || value === 'interrupted';

function receiptSnapshot(value: NativeSessionReceipt): NativeSessionReceipt {
    requireValue(record(value) && Object.keys(value).length === 5 && typeof value.sessionID === 'string' && sessionID.test(value.sessionID)
        && (value.scope === 'customer' || value.scope === 'playground') && typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce)
        && typeof value.binding === 'string' && /^[a-f0-9]{64}$/.test(value.binding) && value.title === `panda-agent-${value.scope}-${value.nonce}`);
    return Object.freeze({ sessionID: value.sessionID, title: value.title, nonce: value.nonce, scope: value.scope, binding: value.binding });
}

// Server boundary only: configuration and durable receipts must never come from browser JSON.
export function createNativeSessionClient(config: { baseUrl: string; password: string; directory: string; expectedPid: number; expectedVersion?: '2.2.2' | '2.2.6'; fetch?: typeof fetch; timeoutMs?: number }) {
    const timeoutMs = config.timeoutMs ?? 5000;
    const expectedVersion = config.expectedVersion ?? '2.2.2';
    requireValue(expectedVersion === '2.2.2' || expectedVersion === '2.2.6');
    const match = typeof config.baseUrl === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(config.baseUrl);
    requireValue(match && Number(match[1]) <= 65535 && typeof config.password === 'string' && Buffer.byteLength(config.password, 'utf8') >= 32 && Buffer.byteLength(config.password, 'utf8') <= 4096
        && boundedText(config.directory, 4096) && isAbsolute(config.directory) && !/[\u0000-\u001f\u007f]/.test(config.directory)
        && Number.isSafeInteger(config.expectedPid) && config.expectedPid > 0 && Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 10000);
    const { baseUrl, directory } = config;
    const transport = config.fetch ?? fetch;
    const authorization = `Basic ${Buffer.from(`opencode:${config.password}`, 'utf8').toString('base64')}`;

    async function operation<T>(input: NativeSessionReceipt, checkAccess: NativeAccessCheck, signal: AbortSignal | undefined, execute: (ctx: {
        receipt: NativeSessionReceipt;
        request: (path: string, body?: unknown, method?: 'POST' | 'DELETE', expected?: 'json' | 'removed' | 'absent') => Promise<Record<string, unknown>>;
        owned: () => Promise<NativeSessionState>;
        inactive: () => Promise<boolean>;
        check: () => Promise<void>;
    }) => Promise<T>): Promise<T> {
        const receipt = receiptSnapshot(input);
        requireValue(typeof checkAccess === 'function');
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        let dispatched = false;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const interrupted = new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new NativeSessionError()), { once: true });
            if (controller.signal.aborted) reject(new NativeSessionError());
        });
        const timer = setTimeout(abort, timeoutMs);
        async function check() {
            controller.signal.throwIfAborted();
            if (await checkAccess(receipt) !== true) throw new NativeSessionError('forbidden');
            controller.signal.throwIfAborted();
        }
        async function request(path: string, body?: unknown, method?: 'POST' | 'DELETE', expected: 'json' | 'removed' | 'absent' = 'json') {
            controller.signal.throwIfAborted();
            const mutation = body !== undefined || method === 'POST' || method === 'DELETE';
            if (mutation) { await check(); dispatched = true; }
            const response = await transport(baseUrl + path, {
                method: method ?? (mutation ? 'POST' : 'GET'), headers: { Accept: 'application/json', Authorization: authorization, 'x-opencode-directory': encodeURIComponent(directory), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
            });
            if (!controller.signal.aborted && !response.redirected && expected === 'removed' && response.status === 204) {
                void response.body?.cancel().catch(() => {});
                return {};
            }
            if (controller.signal.aborted || response.status !== (expected === 'absent' ? 404 : 200) || response.redirected || expected === 'removed' || !/^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('content-type') ?? '') || !response.body) {
                void response.body?.cancel().catch(() => {});
                throw new NativeSessionError();
            }
            const length = response.headers.get('content-length');
            if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
                void response.body.cancel().catch(() => {});
                throw new NativeSessionError();
            }
            const current = response.body.getReader();
            reader = current;
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
                while (true) {
                    const part = await Promise.race([current.read(), interrupted]);
                    controller.signal.throwIfAborted();
                    if (part.done) break;
                    size += part.value.byteLength;
                    requireValue(size <= maxBytes);
                    chunks.push(part.value);
                }
                const decoded = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
                if (expected === 'absent') requireValue(decoded._tag === 'SessionNotFoundError' && decoded.sessionID === receipt.sessionID && boundedText(decoded.message, 2048));
                return decoded;
            } finally {
                void current.cancel().catch(() => {});
                current.releaseLock();
                if (reader === current) reader = undefined;
            }
        }
        async function owned(): Promise<NativeSessionState> {
            const data = object((await request(`/api/session/${receipt.sessionID}`)).data);
            const metadata = object(object(data.metadata).pandaAgent);
            requireValue(data.id === receipt.sessionID && data.title === receipt.title && object(data.location).directory === directory
                && data.parentID === undefined && data.fork === undefined
                && Object.keys(metadata).length === 3 && metadata.nonce === receipt.nonce && metadata.scope === receipt.scope && metadata.binding === receipt.binding);
            const time = object(data.time);
            requireValue(finiteTime(time.created) && finiteTime(time.updated) && (time.busy === undefined || finiteTime(time.busy)) && (time.idle === undefined || finiteTime(time.idle)) && (data.outcome === undefined || outcome(data.outcome)));
            return { ...(data.outcome === undefined ? {} : { outcome: data.outcome }), time: { created: time.created, updated: time.updated, ...(time.busy === undefined ? {} : { busy: time.busy as number }), ...(time.idle === undefined ? {} : { idle: time.idle as number }) } };
        }
        async function inactive() {
            const active = object((await request('/api/session/active')).data);
            requireValue(Object.keys(active).length <= 1000 && Object.entries(active).every(([id, value]) => sessionID.test(id) && object(value).type === 'running'));
            return !Object.hasOwn(active, receipt.sessionID);
        }
        const verifyProcess = async () => {
            const info = await request('/api/info');
            requireValue(typeof info.version === 'string');
            if (info.version !== expectedVersion) throw new NativeSessionError('version_mismatch');
            requireValue(info.pid === config.expectedPid);
        };
        const run = async () => {
            await check();
            await verifyProcess();
            const result = await execute({ receipt, request, owned, inactive, check });
            await verifyProcess();
            await check();
            return result;
        };
        try { return await Promise.race([run(), interrupted]); }
        catch (error) {
            throw new NativeSessionError(error instanceof NativeSessionError ? error.code : 'unavailable', dispatched ? 'unknown' : 'not_dispatched');
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            controller.abort();
            if (reader) void reader.cancel().catch(() => {});
        }
    }
    return {
        create(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => {
                // Native model.list waits for activation of the reviewed plugin/permission policy.
                requireValue(Array.isArray((await ctx.request('/api/model')).data));
                const created = await ctx.request('/api/session', { id: ctx.receipt.sessionID, title: ctx.receipt.title, location: { directory }, metadata: { pandaAgent: { nonce: ctx.receipt.nonce, scope: ctx.receipt.scope, binding: ctx.receipt.binding } }, permissions: [{ action: '*', resource: '*', effect: 'deny' }] });
                requireValue(object(created.data).id === ctx.receipt.sessionID);
                return ctx.owned();
            });
        },
        get(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, ctx => ctx.owned());
        },
        active(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => { await ctx.owned(); return { active: !(await ctx.inactive()) }; });
        },
        messages(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => {
                await ctx.owned();
                const messages: NativeMessage[] = [];
                const seen = new Set<string>();
                const cursors = new Set<string>();
                let next: string | undefined;
                for (let page = 0; page < 4; page++) {
                    const query = next ? `limit=100&cursor=${encodeURIComponent(next)}` : 'limit=100&order=asc';
                    const result = await ctx.request(`/api/session/${ctx.receipt.sessionID}/message?${query}`);
                    const cursor = object(result.cursor);
                    requireValue(Object.keys(cursor).every(key => ['previous', 'next'].includes(key) && (cursor[key] === null || cursor[key] === undefined || (boundedText(cursor[key], 2048) && /^[A-Za-z0-9_-]+={0,2}$/.test(cursor[key] as string)))));
                    requireValue(Array.isArray(result.data) && messages.length + result.data.length <= 100);
                    for (const value of result.data) {
                        const item = object(value), time = object(item.time);
                        requireValue(typeof item.id === 'string' && messageID.test(item.id) && !seen.has(item.id) && finiteTime(time.created));
                        seen.add(item.id);
                        const base = { id: item.id, created: time.created };
                        if (item.type === 'user') {
                            requireValue(boundedText(item.text, 98304));
                            messages.push({ ...base, type: 'user', text: item.text });
                        } else if (item.type === 'assistant') {
                            requireValue(Array.isArray(item.content) && item.content.length <= 256 && (time.completed === undefined || finiteTime(time.completed)));
                            let text = '';
                            for (const value of item.content) {
                                const part = object(value);
                                requireValue(['text', 'reasoning', 'tool'].includes(part.type as string));
                                if (part.type === 'text') { requireValue(boundedText(part.text, 98304)); text += part.text; }
                            }
                            requireValue(boundedText(text, 98304));
                            messages.push({ ...base, type: 'assistant', text, ...(time.completed === undefined ? {} : { completed: time.completed as number }), failed: item.error !== undefined, retrying: item.retry !== undefined });
                        } else if (item.type === 'idle') {
                            requireValue(outcome(item.outcome));
                            messages.push({ ...base, type: 'idle', outcome: item.outcome });
                        } else {
                            requireValue(['agent-switched', 'model-switched', 'location-switched', 'synthetic', 'system', 'skill', 'shell', 'compaction'].includes(item.type as string));
                            messages.push({ ...base, type: 'activity' });
                        }
                    }
                    if (cursor.next === null || cursor.next === undefined) { await ctx.owned(); return messages; }
                    requireValue(result.data.length > 0 && typeof cursor.next === 'string' && !cursors.has(cursor.next));
                    next = cursor.next;
                    cursors.add(next);
                }
                throw new NativeSessionError();
            });
        },
        prompt(receipt: NativeSessionReceipt, input: { messageID: string; text: string }, check: NativeAccessCheck, signal?: AbortSignal) {
            requireValue(record(input) && Object.keys(input).length === 2 && typeof input.messageID === 'string' && messageID.test(input.messageID) && boundedText(input.text, 98304) && input.text.trim().length > 0);
            const { messageID: id, text } = input;
            return operation(receipt, check, signal, async ctx => {
                await ctx.owned();
                requireValue(await ctx.inactive());
                requireValue(Array.isArray((await ctx.request('/api/model')).data));
                const data = object((await ctx.request(`/api/session/${ctx.receipt.sessionID}/prompt`, { id, text })).data);
                requireValue(data.type === 'user' && data.id === id && data.sessionID === ctx.receipt.sessionID && finiteTime(object(data.time).created) && (data.delivery === 'steer' || data.delivery === 'queue') && object(data.payload).text === text);
                await ctx.owned();
                return { status: 'accepted' as const, messageID: id };
            });
        },
        interrupt(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => {
                const before = await ctx.owned();
                const terminal = (state: NativeSessionState) => state.outcome !== undefined && state.time.busy !== undefined && state.time.idle !== undefined && state.time.idle >= state.time.busy;
                if (await ctx.inactive() && terminal(before)) return { status: 'already_terminal' as const, outcome: before.outcome };
                const response = await ctx.request(`/api/session/${ctx.receipt.sessionID}/interrupt?resume=false`, undefined, 'POST');
                requireValue(typeof response.interrupted === 'boolean');
                const after = await ctx.owned();
                const idle = await ctx.inactive();
                // An interrupt receipt alone cannot prove the owned drain has stopped.
                const confirmed = response.interrupted && idle && terminal(after) && after.outcome === 'interrupted'
                    && (before.time.busy === undefined || after.time.busy! >= before.time.busy)
                    && (before.time.idle === undefined || after.time.idle! > before.time.idle);
                return confirmed ? { status: 'cancelled' as const, outcome: 'interrupted' as const } : { status: 'unknown' as const };
            });
        },
        // Caller must fence cleanup against a durable terminal journal and any future prompt.
        remove(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => {
                const before = await ctx.owned();
                const terminal = before.outcome !== undefined && before.time.busy !== undefined && before.time.idle !== undefined && before.time.idle >= before.time.busy;
                requireValue(terminal || before.time.busy === undefined);
                requireValue(await ctx.inactive());
                // Native removal cascades to child sessions; refuse even one child.
                const children = await ctx.request(`/api/session?parentID=${ctx.receipt.sessionID}&limit=1`);
                const cursor = object(children.cursor);
                requireValue(Array.isArray(children.data) && children.data.length === 0 && (cursor.next === null || cursor.next === undefined));
                await ctx.owned();
                requireValue(await ctx.inactive());
                await ctx.request(`/api/session/${ctx.receipt.sessionID}`, undefined, 'DELETE', 'removed');
                await ctx.request(`/api/session/${ctx.receipt.sessionID}`, undefined, undefined, 'absent');
                return { status: 'removed' as const };
            });
        },
        // Observation only after uncertain removal; a 404 from another process is not proof.
        absence(receipt: NativeSessionReceipt, check: NativeAccessCheck, signal?: AbortSignal) {
            return operation(receipt, check, signal, async ctx => {
                await ctx.request(`/api/session/${ctx.receipt.sessionID}`, undefined, undefined, 'absent');
                return { absent: true as const };
            });
        },
    };
}
