import { createHash } from 'node:crypto';
import config from '../../config/hybrid-v1.json' with { type: 'json' };
export const HYBRID_CONFIG_HASH = createHash('sha256').update(JSON.stringify(config)).digest('hex');
export const HYBRID_PROTOCOL_HASH = config.evaluationProtocolSha256;
export const HYBRID_MODEL = config.model;
