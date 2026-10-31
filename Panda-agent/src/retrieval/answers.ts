import { createHash } from 'node:crypto';
import type { Actor, Adapters, CanonicalChunk, Outcome, Question, Scope } from './contracts.ts';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const bounded = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const privatePointer = (s: string) => /(?:s3:\/\/|["']?(?:private[_ -]?(?:bucket|key)|bucket|object[_ -]?key|storage[_ -]?(?:path|key))["']?\s*[:=]|file:\/\/|\\\\)/i.test(s);
export function parseQuestion(value: unknown): Question | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return null;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).some(k => !['question', 'productSku', 'physicalRevision'].includes(k)))
        return null;
    if (!bounded(v.question, 2000) || Buffer.byteLength(JSON.stringify(v), 'utf8') > 8192)
        return null;
    if (v.productSku !== undefined && !bounded(v.productSku, 128))
        return null;
    if (v.physicalRevision !== undefined && !bounded(v.physicalRevision, 128))
        return null;
    return { question: v.question.trim(), ...(v.productSku === undefined ? {} : { productSku: (v.productSku as string).trim() }), ...(v.physicalRevision === undefined ? {} : { physicalRevision: (v.physicalRevision as string).trim() }) };
}
// Conservative refusal for requests requiring absent physical, execution, or linked-source proof.
function needsUnavailableProof(q: string): boolean {
    return /\b(?:wir(?:e|ing)|pin\s*(?:map|out|assignment)|gpio|guaranteed|safe(?:ly|ty)?|physical\s*revision|board\s*revision|revision\s*(?:of|equivalen|match)|hardware\s*(?:tests?|test(?:ed|ing)|verified)|(?:verify|verified|verification|confirm|confirmed)\s*(?:the\s*)?(?:physical\s*)?board|board\s*(?:verification|verified|tested)|(?:tested|verified)\s*(?:on|with)\s*(?:hardware|board)|(?:proven|verified|guaranteed)\s*(?:to\s*)?compil(?:e|es|ed|ing)|(?:absolute.maximum|ratings?).{0,80}(?:datasheet|linked|pdf)|(?:datasheet|linked|pdf).{0,80}(?:absolute.maximum|ratings?))\b/i.test(q);
}
function validChunk(c: CanonicalChunk, productId: string, revision?: string): boolean {
    if (!c || c.productId !== productId || c.blocked !== false || !bounded(c.handle, 300) || !/^panda:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{64}:[0-9a-f]{64}$/.test(c.handle))
        return false;
    if (!bounded(c.text, 12000) || sha(c.text) !== c.textHash || !bounded(c.header, 1000))
        return false;
    if (revision && c.physicalRevision !== revision)
        return false;
    if (!bounded(c.title, 300) || !bounded(c.capturedAt, 50) || !Number.isFinite(Date.parse(c.capturedAt)))
        return false;
    if (!Array.isArray(c.sectionPath) || c.sectionPath.length > 12 || c.sectionPath.some(s => !bounded(s, 200) || privatePointer(s)))
        return false;
    if (privatePointer(c.title) || privatePointer(c.text))
        return false;
    try {
        const u = new URL(c.sourceUrl);
        if (u.protocol !== 'https:' || !['pandabyte.in', 'www.pandabyte.in'].includes(u.hostname) || u.port || u.username || u.password || u.search || u.hash || !/^\/product-page\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname))
            return false;
    }
    catch {
        return false;
    }
    return true;
}
function validScope(scope: Scope | null): scope is Scope {
    return !!scope && bounded(scope.fingerprint, 300) && scope.candidate === true && scope.sealed === true && scope.engineeringVerified === true && scope.manifestVerified === true && scope.configVerified === true && scope.generationCurrent === true && Array.isArray(scope.chunks) && scope.chunks.length <= 2000;
}
export function reciprocalRankFusion(lexical: string[], dense: string[]): string[] {
    const scores = new Map<string, number>();
    for (const list of [lexical, dense]) {
        const seen = new Set<string>();
        list.forEach((handle, i) => { if (!seen.has(handle)) {
            seen.add(handle);
            scores.set(handle, (scores.get(handle) ?? 0) + 1 / (60 + i + 1));
        } });
    }
    return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([h]) => h);
}
export async function answerQuestion(actor: Actor, raw: unknown, adapters?: Adapters): Promise<Outcome> {
    if (!actor || !bounded(actor.subject, 512))
        return { kind: 'unauthorized' };
    const input = parseQuestion(raw);
    if (!input)
        return { kind: 'invalid' };
    if (!adapters)
        return { kind: 'unavailable' };
    try {
        const policy = adapters.ranking ?? { mode: 'lexical' as const };
        if (!policy || !['lexical', 'dense', 'rrf'].includes(policy.mode))
            return { kind: 'unavailable' };
        if (policy.mode === 'rrf' && (!['engineering_experiment', 'validated_evaluation'].includes(policy.admission) || !/^[0-9a-f]{64}$/.test(policy.evidenceSha256)))
            return { kind: 'unavailable' };
        const identity = await adapters.resolveIdentity(actor, input);
        if (identity.kind !== 'resolved')
            return { kind: identity.kind === 'conflict' ? 'conflict' : 'clarification' };
        if (!identity.product || !bounded(identity.product.id, 300) || !bounded(identity.product.sku, 128))
            return { kind: 'unavailable' };
        if (input.productSku && input.productSku.toLowerCase() !== identity.product.sku.toLowerCase())
            return { kind: 'clarification' };
        if (needsUnavailableProof(input.question))
            return { kind: 'insufficient' };
        const scope = await adapters.currentScope(actor, identity.product, input.physicalRevision);
        if (!validScope(scope))
            return { kind: 'unavailable' };
        const eligible = scope.chunks.filter(c => validChunk(c, identity.product.id, input.physicalRevision));
        const byHandle = new Map(eligible.map(c => [c.handle, c]));
        if (byHandle.size !== eligible.length)
            return { kind: 'unavailable' };
        const handles = [...byHandle.keys()].sort();
        if (!handles.length)
            return { kind: 'insufficient' };
        const lexical = policy.mode === 'dense' ? [] : await adapters.lexical(input.question, handles);
        if (!Array.isArray(lexical) || lexical.length > 100 || lexical.some(h => !byHandle.has(h)))
            return { kind: 'unavailable' };
        const dense = policy.mode === 'lexical' ? [] : await adapters.dense(input.question, handles);
        if (!Array.isArray(dense) || dense.length > 100 || dense.some(h => {
            const c = byHandle.get(h.handle);
            return !c || !Number.isFinite(h.score) || !bounded(h.text, 12000) || h.textHash !== sha(h.text) || h.header !== c.header || !c.text.includes(h.text);
        }))
            return { kind: 'unavailable' };
        // An engineering comparison is explicit; it is not a production quality claim.
        const ranked = [...new Set(policy.mode === 'rrf' ? reciprocalRankFusion(lexical, dense.map(h => h.handle)) : policy.mode === 'dense' ? dense.map(h => h.handle) : lexical)].slice(0, 8);
        if (!ranked.length)
            return { kind: 'insufficient' };
        let remaining = 20000;
        const fragments: Array<{
            handle: string;
            text: string;
        }> = [];
        for (const handle of ranked) {
            const text = lexical.includes(handle) ? byHandle.get(handle)!.text : dense.find(hit => hit.handle === handle)!.text;
            if (text.length <= remaining) {
                fragments.push({ handle, text });
                remaining -= text.length;
            }
        }
        if (!fragments.length)
            return { kind: 'insufficient' };
        const scopeUnchanged = async (selected: string[]) => {
            const current = await adapters.currentScope(actor, identity.product, input.physicalRevision);
            if (!validScope(current) || current.fingerprint !== scope.fingerprint)
                return false;
            const currentEligible = current.chunks.filter(c => validChunk(c, identity.product.id, input.physicalRevision));
            const currentMap = new Map(currentEligible.map(c => [c.handle, c]));
            return currentMap.size === currentEligible.length && selected.every(handle => JSON.stringify(currentMap.get(handle)) === JSON.stringify(byHandle.get(handle)));
        };
        if (!await scopeUnchanged(fragments.map(fragment => fragment.handle)))
            return { kind: 'unavailable' };
        const result = await adapters.select(input.question, fragments);
        if (!result || Object.keys(result).some(k => k !== 'selections') || !Array.isArray(result.selections) || result.selections.length < 1 || result.selections.length > 4)
            return { kind: 'unavailable' };
        const seen = new Set<string>();
        for (const s of result.selections) {
            if (!s || Object.keys(s).some(k => !['handle', 'quote'].includes(k)) || !fragments.some(f => f.handle === s.handle) || seen.has(s.handle) || !bounded(s.quote, 600) || privatePointer(s.quote) || !fragments.find(f => f.handle === s.handle)!.text.includes(s.quote))
                return { kind: 'unavailable' };
            seen.add(s.handle);
        }
        if (!await scopeUnchanged(result.selections.map(selection => selection.handle)))
            return { kind: 'unavailable' };
        return { kind: 'evidence', citations: result.selections.map((s, i) => { const c = byHandle.get(s.handle)!; return { id: `S${i + 1}`, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, quote: s.quote, sectionPath: [...c.sectionPath] }; }) };
    }
    catch {
        return { kind: 'unavailable' };
    }
}
