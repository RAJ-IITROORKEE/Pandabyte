import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Adapters } from '../retrieval/contracts';
import { createInsforgeAdapters } from '../retrieval/insforge-adapters';
import { createHybridInsforgeAdapters } from '../retrieval/pgvector-adapter';
import { createGuardEmbeddingClient } from '../retrieval/embedding-client';
import { HYBRID_CONFIG_HASH, HYBRID_PROTOCOL_HASH } from '../retrieval/hybrid-config';
import type { ActivityReporter } from './chat-contracts';

export async function localRetrievalMode(): Promise<'lexical' | 'hybrid'> {
  if (process.env.NODE_ENV === 'production' || process.env.PANDA_AGENT_LOCAL_WORKFLOW_ENABLED !== 'true') return 'lexical';
  let raw: string;
  try { raw = await readFile(path.resolve(process.cwd(), 'Panda-agent/infra/local-workflow/artifacts/hybrid-experiment.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'lexical'; throw new Error('Retrieval configuration unavailable'); }
  if (raw.length > 2048) throw new Error('Retrieval configuration unavailable');
  const value = JSON.parse(raw);
  if (value.mode !== 'hybrid' || value.admission !== 'engineering_experiment' || value.configHash !== HYBRID_CONFIG_HASH || value.protocolHash !== HYBRID_PROTOCOL_HASH) throw new Error('Retrieval configuration unavailable');
  return 'hybrid';
}
export async function localRetrievalAdapters(client: Parameters<typeof createInsforgeAdapters>[0], select: Adapters['select'], activity?: ActivityReporter): Promise<Adapters> {
  if (await localRetrievalMode() === 'lexical') return { ...createInsforgeAdapters(client, select), activity };
  const raw = await readFile(path.resolve(process.cwd(), 'Panda-agent/infra/local-workflow/artifacts/embedding-runtime.json'), 'utf8');
  if (raw.length > 4096) throw new Error('Embedding transport unavailable');
  const config = JSON.parse(raw);
  if (config.baseUrl !== 'http://127.0.0.1:4598' || config.authority !== 'i-05bcf2573a0b77f7a' || typeof config.token !== 'string' || !/^[a-f0-9]{64}$/.test(config.token)) throw new Error('Embedding transport unavailable');
  const embed = createGuardEmbeddingClient(config.token);
  return { ...createHybridInsforgeAdapters(client, select, async text => (await embed([text]))[0], { configHash: HYBRID_CONFIG_HASH, evidenceSha256: HYBRID_PROTOCOL_HASH }), activity };
}
