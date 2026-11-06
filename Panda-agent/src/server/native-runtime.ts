import { createHash, createHmac } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { createNativeSessionClient } from '../opencode/session-client.ts';
import { NativeSessionError } from '../opencode/session-contracts.ts';

type Descriptor = Readonly<{ version: 1; generation: string; pid: number; baseUrl: string; directory: string; configHash: string; password: string }>;
type Purpose = 'dispatch' | 'observe';
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = 'baseUrl,configHash,directory,generation,password,pid,version';
const maxBytes = 16_384;

function descriptor(value: unknown): Descriptor | null {
    if (!object(value) || Reflect.ownKeys(value).some(key => typeof key !== 'string') || Object.getOwnPropertyNames(value).sort().join(',') !== keys
        || value.version !== 1 || !hex(value.generation) || !hex(value.configHash) || !Number.isSafeInteger(value.pid) || (value.pid as number) <= 0
        || typeof value.baseUrl !== 'string' || !/^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.test(value.baseUrl) || Number(new URL(value.baseUrl).port) > 65535
        || typeof value.directory !== 'string' || !value.directory.isWellFormed() || Buffer.byteLength(value.directory) > 4096 || !isAbsolute(value.directory) || /[\u0000-\u001f\u007f]/.test(value.directory)
        || typeof value.password !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(value.password)) return null;
    return Object.freeze({ version: 1, generation: value.generation, pid: value.pid as number, baseUrl: value.baseUrl, directory: resolve(value.directory), configHash: value.configHash, password: value.password });
}

// This private supervisor identity proves observation ownership, never provider privacy or inference eligibility.
export function createNativeRuntimeAdmission(config: { key: string; readDescriptor: () => Promise<unknown | null>; fetch?: typeof fetch; timeoutMs?: number }) {
    const timeoutMs = config.timeoutMs ?? 3000;
    if (!hex(config.key) || typeof config.readDescriptor !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new NativeSessionError();
    const key = Buffer.from(config.key, 'hex'), readDescriptor = config.readDescriptor, transport = config.fetch ?? fetch;
    const binding = (value: Descriptor) => createHmac('sha256', key).update(JSON.stringify([
        'pandabyte/native-runtime/v1', value.generation, value.pid, value.directory, '2.2.2', value.configHash,
        createHash('sha256').update(value.password, 'utf8').digest('hex'), value.baseUrl,
    ])).digest('hex');

    async function verify(expected?: string, signal?: AbortSignal): Promise<{ snapshot: Descriptor; binding: string } | null> {
        if (signal?.aborted) return null;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const interrupted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new NativeSessionError()), { once: true }));
        const timer = setTimeout(abort, timeoutMs);
        const run = async () => {
            const snapshot = descriptor(await readDescriptor());
            controller.signal.throwIfAborted();
            if (!snapshot) return null;
            const id = binding(snapshot);
            if (expected !== undefined && expected !== id) return null;
            const response = await transport(snapshot.baseUrl + '/api/info', {
                method: 'GET', headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`opencode:${snapshot.password}`, 'utf8').toString('base64')}`, 'x-opencode-directory': encodeURIComponent(snapshot.directory) },
                signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
            });
            const length = response.headers.get('content-length');
            if (controller.signal.aborted || response.status !== 200 || response.redirected || !/^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('content-type') ?? '') || !response.body
                || (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) {
                void response.body?.cancel().catch(() => {}); return null;
            }
            reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const part = await reader.read();
                controller.signal.throwIfAborted();
                if (part.done) break;
                size += part.value.byteLength;
                if (size > maxBytes) return null;
                chunks.push(part.value);
            }
            const info: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
            if (!object(info) || info.version !== '2.2.2' || info.pid !== snapshot.pid) return null;
            const current = descriptor(await readDescriptor());
            controller.signal.throwIfAborted();
            return current && binding(current) === id ? { snapshot, binding: id } : null;
        };
        try { return await Promise.race([run(), interrupted]); }
        catch { return null; }
        finally {
            clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
            if (reader) void reader.cancel().catch(() => {});
        }
    }

    async function connection(signal?: AbortSignal) {
        const verified = await verify(undefined, signal);
        if (!verified) return null;
        const { snapshot, binding } = verified;
        const native = createNativeSessionClient({ baseUrl: snapshot.baseUrl, password: snapshot.password, directory: snapshot.directory, expectedPid: snapshot.pid, fetch: transport, timeoutMs: 10000 });
        const deny = async (): Promise<never> => { throw new NativeSessionError('forbidden'); };
        return Object.freeze({
            binding,
            native: Object.freeze({ ...native, create: deny, prompt: deny }),
            async authorize(purpose: Purpose, signal?: AbortSignal) { return purpose === 'observe' ? (await verify(binding, signal))?.binding ?? null : null; },
        });
    }
    return Object.freeze({
        connection,
        async authorize(purpose: Purpose, signal?: AbortSignal) { return purpose === 'observe' ? (await verify(undefined, signal))?.binding ?? null : null; },
    });
}
