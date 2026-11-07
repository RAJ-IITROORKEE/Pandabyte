const version = '2.2.2' as const;
const maxBytes = 1_000_000;
const maxEntries = 500;

export type NativeSkill = { id: string; name: string; description?: string; autoinvoke?: boolean };
export type NativeMcpServer = { name: string; title?: string; status: 'connected' | 'pending' | 'disabled' | 'failed' | 'needs_auth' };
export type NativeModel = { id: string; name: string; providerID: string; status: 'alpha' | 'beta' | 'deprecated' | 'active' };

export type NativeInspection = {
    version: typeof version;
    status: 'discovery_only';
    execution: 'not_execution_ready';
    counts: { skills: number; mcpServers: number; models: number };
    skills: NativeSkill[];
    mcpServers: NativeMcpServer[];
    models: NativeModel[];
    capabilities: { install: false; configure: false; execute: false };
};
export class NativeInspectionError extends Error {
    readonly code: 'unavailable' | 'version_mismatch';
    constructor(code: 'unavailable' | 'version_mismatch' = 'unavailable') {
        super(code);
        this.name = 'NativeInspectionError';
        this.code = code;
    }
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function label(value: unknown, max = 256): string {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]|\p{Surrogate}/u.test(value)) throw new NativeInspectionError();
    return value;
}
function catalog<T>(value: unknown, project: (item: unknown) => T, key: (item: T) => string): T[] {
    if (!Array.isArray(value) || value.length > maxEntries) throw new NativeInspectionError();
    const result = value.map(project);
    if (new Set(result.map(key)).size !== result.length) throw new NativeInspectionError();
    return result;
}
function skill(value: unknown): NativeSkill {
    if (!record(value) || (value.autoinvoke !== undefined && typeof value.autoinvoke !== 'boolean')) throw new NativeInspectionError();
    return { id: label(value.id), name: label(value.name), ...(value.description === undefined || value.description === '' ? {} : { description: label(value.description, 2000) }), ...(value.autoinvoke === undefined ? {} : { autoinvoke: value.autoinvoke }) };
}
function mcpServer(value: unknown): NativeMcpServer {
    if (!record(value) || !['connected', 'pending', 'disabled', 'failed', 'needs_auth'].includes(value.status as string)) throw new NativeInspectionError();
    return { name: label(value.name), ...(value.title === undefined || value.title === '' ? {} : { title: label(value.title) }), status: value.status as NativeMcpServer['status'] };
}
function model(value: unknown): NativeModel {
    if (!record(value) || !['alpha', 'beta', 'deprecated', 'active'].includes(value.status as string)) throw new NativeInspectionError();
    return { id: label(value.id), name: label(value.name), providerID: label(value.providerID), status: value.status as NativeModel['status'] };
}

// Reproject at the HTTP boundary too: injected adapters are not a release authority.
export function projectNativeInspection(value: unknown): NativeInspection {
    if (!record(value) || value.version !== version || value.status !== 'discovery_only' || value.execution !== 'not_execution_ready' || !record(value.counts)) throw new NativeInspectionError();
    const skills = catalog(value.skills, skill, item => item.id);
    const mcpServers = catalog(value.mcpServers, mcpServer, item => item.name);
    const models = catalog(value.models, model, item => `${item.providerID}\0${item.id}`);
    const counts = { skills: skills.length, mcpServers: mcpServers.length, models: models.length };
    const reportedCounts = value.counts;
    if (Object.entries(counts).some(([key, count]) => reportedCounts[key] !== count)) throw new NativeInspectionError();
    return { version, status: 'discovery_only', execution: 'not_execution_ready', counts, skills, mcpServers, models, capabilities: { install: false, configure: false, execute: false } };
}

export function createNativeInspectionClient(config: { baseUrl: string; password: string; fetch?: typeof fetch; timeoutMs?: number }) {
    const timeoutMs = config.timeoutMs ?? 3000;
    // A literal loopback origin prevents URL normalization, paths and credentials becoming routing inputs.
    const match = typeof config.baseUrl === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(config.baseUrl);
    if (!match || Number(match[1]) > 65535 || typeof config.password !== 'string' || Buffer.byteLength(config.password, 'utf8') < 32 || Buffer.byteLength(config.password, 'utf8') > 4096 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new NativeInspectionError();
    const transport = config.fetch ?? fetch;
    const baseUrl = config.baseUrl;
    const authorization = `Basic ${Buffer.from(`opencode:${config.password}`, 'utf8').toString('base64')}`;
    return {
        async inspect(signal?: AbortSignal): Promise<NativeInspection> {
            const controller = new AbortController();
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
            const interrupted = new Promise<never>((_, reject) => {
                controller.signal.addEventListener('abort', () => reject(new NativeInspectionError()), { once: true });
                if (controller.signal.aborted) reject(new NativeInspectionError());
            });
            const timer = setTimeout(abort, timeoutMs);
            async function get(path: string): Promise<unknown> {
                controller.signal.throwIfAborted();
                const response = await transport(baseUrl + path, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit' });
                if (controller.signal.aborted) {
                    void response.body?.cancel().catch(() => {});
                    throw new NativeInspectionError();
                }
                if (response.status !== 200 || response.redirected || !/^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('content-type') ?? '') || !response.body) {
                    void response.body?.cancel().catch(() => {});
                    throw new NativeInspectionError();
                }
                const length = response.headers.get('content-length');
                if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
                    void response.body.cancel().catch(() => {});
                    throw new NativeInspectionError();
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
                        if (size > maxBytes) throw new NativeInspectionError();
                        chunks.push(part.value);
                    }
                    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
                } finally {
                    void current.cancel().catch(() => {});
                    current.releaseLock();
                    if (reader === current) reader = undefined;
                }
            }
            const operation = async () => {
                const info = await get('/api/info');
                if (!record(info) || typeof info.version !== 'string') throw new NativeInspectionError();
                if (info.version !== version) throw new NativeInspectionError('version_mismatch');
                async function list(path: string): Promise<unknown[]> {
                    const result = await get(path);
                    if (!record(result) || !Array.isArray(result.data)) throw new NativeInspectionError();
                    return result.data;
                }
                // Native 2.2.2 model.list waits for plugin/policy activation; skill.list does not.
                const models = catalog(await list('/api/model'), model, item => `${item.providerID}\0${item.id}`);
                const skills = catalog(await list('/api/skill'), skill, item => item.id);
                const mcpServers = catalog(await list('/api/mcp'), value => {
                    if (!record(value) || !record(value.status)) throw new NativeInspectionError();
                    // MCP error text/configuration can contain credentials; release only its typed status.
                    return mcpServer({ name: value.name, title: value.title, status: value.status.status });
                }, item => item.name);
                controller.signal.throwIfAborted();
                return projectNativeInspection({ version, status: 'discovery_only', execution: 'not_execution_ready', counts: { skills: skills.length, mcpServers: mcpServers.length, models: models.length }, skills, mcpServers, models });
            };
            try {
                return await Promise.race([operation(), interrupted]);
            } catch (error) {
                throw error instanceof NativeInspectionError ? error : new NativeInspectionError();
            } finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                controller.abort();
                if (reader) void reader.cancel().catch(() => {});
            }
        },
    };
}
