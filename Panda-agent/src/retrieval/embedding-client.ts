import { validEmbedding } from './pgvector-adapter.ts';
const MODEL = 'perplexity/pplx-embed-v1-0.6b';
const MAX_BYTES = 1024 * 1024;
export function createGuardEmbeddingClient(token: string, fetcher: typeof fetch = fetch): (inputs: string[]) => Promise<number[][]> {
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('Invalid guard token');
    return async inputs => {
        if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 16 || inputs.some(x => typeof x !== 'string' || !x.trim() || x.length > 12000)) throw new Error('Invalid embedding input');
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 40000);
        try {
            const response = await fetcher('http://127.0.0.1:4598/v1/embeddings', { method:'POST', redirect:'error', cache:'no-store', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}`, Connection:'close' }, body:JSON.stringify({ model:MODEL, input:inputs, encoding_format:'float' }), signal:controller.signal });
            if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Embedding guard unavailable'); }
            const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
            try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Embedding response too large'); } parts.push(value); } } finally { reader.releaseLock(); }
            const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
            const result = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as { model?: unknown; data?: unknown };
            if ((result.model !== MODEL && result.model !== 'pplx-embed-v1-0.6b') || !Array.isArray(result.data) || result.data.length !== inputs.length) throw new Error('Invalid embedding response');
            return result.data.map((row: { index?: unknown; embedding?: unknown }, index: number) => { if (!row || row.index !== index || !validEmbedding(row.embedding)) throw new Error('Invalid embedding response'); return row.embedding; });
        } finally { clearTimeout(timer); }
    };
}
