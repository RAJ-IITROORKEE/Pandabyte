import 'server-only';
import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

export const evaluationCaseSet = Object.freeze({
    key: 'engineering-listings-v1',
    hash: '9f33d626e2f82390291c1601808ef11c000f517f98d1339a142141114df4fd43',
    count: 20,
    classification: 'source_visible_engineering' as const,
    heldOut: false as const,
});

type Fact = Readonly<{
    kind: 'fact'; id: string; question: string; sku: string; sourceUrl: string; expected: string;
    support: ReadonlyArray<Readonly<{ quote: string; chunkHash: string }>>;
}>;
type Negative = Readonly<{ kind: 'negative'; id: string; question: string; expected: 'clarification' | 'insufficient'; alternate?: 'clarification' | 'insufficient' }>;
export type EvaluationCase = Fact | Negative;
export type EvaluationPack = Readonly<{ descriptor: typeof evaluationCaseSet; cases: ReadonlyArray<EvaluationCase> }>;

type FrozenRow = {
    id: string; question: string; expected_behavior: string; expected_answer: string; sku: string; source_url: string;
    support: Array<{ quote: string; chunk_sha256: string }>; accepted_behaviors?: string[];
};

/** The original reviewed answer key stays in a private file. Its exact digest also pins its schema and order. */
export async function loadEvaluationCases(path = process.env.PANDA_AGENT_EVALUATION_PACK_FILE): Promise<EvaluationPack> {
    try {
        if (!path || !isAbsolute(path) || !(await lstat(path)).isFile()) throw Error();
        const file = await open(path, 'r');
        let bytes: Buffer;
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size !== 63962) throw Error();
            bytes = Buffer.alloc(stat.size + 1);
            let offset = 0;
            while (offset < bytes.length) {
                const {bytesRead} = await file.read(bytes, offset, bytes.length - offset, offset);
                if (!bytesRead) break;
                offset += bytesRead;
            }
            if (offset !== stat.size) throw Error();
            bytes = bytes.subarray(0, offset);
        } finally { await file.close(); }
        if (createHash('sha256').update(bytes).digest('hex') !== evaluationCaseSet.hash) throw Error();
        const rows: FrozenRow[] = JSON.parse(bytes.toString('utf8')).cases;
        const cases = rows.map((row): EvaluationCase => {
            if (row.expected_behavior === 'attributed_historical_listing_assertion') {
                return Object.freeze({kind: 'fact', id: row.id, question: row.question, sku: row.sku, sourceUrl: row.source_url,
                    expected: row.expected_answer, support: Object.freeze(row.support.map(s => Object.freeze({quote: s.quote, chunkHash: s.chunk_sha256})))});
            }
            if (!['request_product_identity', 'insufficient_evidence'].includes(row.expected_behavior)) throw Error();
            const accepted = row.accepted_behaviors ?? [];
            return Object.freeze({kind: 'negative', id: row.id, question: row.question,
                expected: row.expected_behavior === 'request_product_identity' ? 'clarification' : 'insufficient',
                ...(accepted.includes('clarification_without_pin_assignment_or_safety_guarantee') ? {alternate:'clarification' as const} : {}),
                ...(accepted.includes('insufficient_evidence_plus_sensor_and_revision_clarification') ? {alternate:'insufficient' as const} : {})});
        });
        return Object.freeze({descriptor: evaluationCaseSet, cases: Object.freeze(cases)});
    } catch { throw Error('Evaluation case pack unavailable'); }
}
