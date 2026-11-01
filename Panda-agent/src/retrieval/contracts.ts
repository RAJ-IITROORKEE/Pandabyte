import type { ContextSummary } from './context-summary.ts';
// Internal server context derived from the active Clerk session, never request JSON.
export type Actor = {
    subject: string;
} | null;
export type Question = {
    question: string;
    productSku?: string;
    physicalRevision?: string;
};
export type Product = {
    id: string;
    sku: string;
};
export type Identity = {
    kind: 'resolved';
    product: Product;
} | {
    kind: 'clarification' | 'conflict';
};
export type CanonicalChunk = {
    handle: string;
    productId: string;
    text: string;
    textHash: string;
    header: string;
    physicalRevision: string | null;
    blocked: boolean;
    title: string;
    sourceUrl: string;
    capturedAt: string;
    sectionPath: string[];
};
export type Scope = {
    // All fields are produced by the trusted canonical adapter, never the request.
    fingerprint: string;
    candidate: true;
    sealed: true;
    engineeringVerified: true;
    manifestVerified: true;
    configVerified: true;
    generationCurrent: true;
    chunks: CanonicalChunk[];
};
export type DenseHit = {
    handle: string;
    text: string;
    textHash: string;
    header: string;
    score: number;
};
export type RankingPolicy = {
    mode: 'lexical' | 'dense';
} | {
    mode: 'rrf';
    admission: 'engineering_experiment' | 'validated_evaluation';
    evidenceSha256: string;
};
export type Selection = {
    handle: string;
    quote: string;
};
export type Citation = {
    id: string;
    title: string;
    sourceUrl: string;
    capturedAt: string;
    quote: string;
    sectionPath: string[];
};
export type Outcome = {
    kind: 'evidence';
    citations: Citation[];
} | {
    kind: 'clarification' | 'insufficient' | 'conflict' | 'unavailable' | 'unauthorized' | 'invalid';
};
export type Adapters = {
    // Best-effort observed operations only; never model reasoning or native identifiers.
    activity?: (stage: 'resolving_product' | 'reading_sources' | 'searching_sources' | 'checking_citations', summary?: ContextSummary) => void;
    // Trusted server selection only. RRF evidence binds a frozen experiment protocol or validated report.
    ranking?: RankingPolicy;
    // Resolve exact SKU or explicitly verified aliases, including contradictory question identities.
    resolveIdentity(actor: Exclude<Actor, null>, input: Question): Promise<Identity>;
    // Must enforce current source/version approval, rights, generation, tombstones and product mapping.
    currentScope(actor: Exclude<Actor, null>, product: Product, revision?: string): Promise<Scope | null>;
    lexical(question: string, eligibleHandles: string[]): Promise<string[]>;
    // Must enforce handles BEFORE vector search. The trusted native scoped-query adapter verifies
    // raw prefix bytes/receipts and strips the exact header before returning body text. Separate
    // header equality below is not proof of raw native bytes. Never accept adapters/proofs from JSON.
    dense(question: string, eligibleHandles: string[]): Promise<DenseHit[]>;
    // Extractive selection only; valid quotations do not establish semantic answer quality.
    select(question: string, fragments: Array<{
        handle: string;
        text: string;
    }>, context?: { revalidate(): Promise<boolean> }): Promise<{
        selections: Selection[];
    }>;
};
