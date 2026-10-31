export type Admission = {
    kind: 'admin';
} | {
    kind: 'unauthorized' | 'forbidden' | 'unavailable';
};
export type ErrorCode = 'not_found' | 'conflict' | 'forbidden' | 'unavailable';
export type Result<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    code: ErrorCode;
};
export type Intake = {
    reference: string;
    title: string;
    kind: 'link' | 'upload';
    status: string;
    rightsStatus: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    uploadSummary?: {
        filename: string;
        mediaType: string;
        bytes: number;
        integrityStatus?: string;
    };
    sourceSummary?: {
        sourceUrl: string;
        publisher?: string;
        fetched: false;
    };
    reviewSummary?: {
        decision: string;
        reason: string;
        reviewedAt: string;
    };
};
export type Metadata = {
    title: string;
    publisher?: string;
    purpose?: string;
    rightsEvidence?: string;
};
export type LinkInput = Metadata & {
    kind: 'link';
    sourceUrl: string;
};
export type ReviewInput = {
    decision: 'accept_for_preparation' | 'reject';
    expectedVersion: number;
    reason: string;
    rights: 'unknown' | 'permitted' | 'denied';
    rightsEvidence: string;
};
export type CaseSet = {
    key: string;
    hash: string;
    count: number;
    classification: 'source_visible_engineering';
    heldOut: false;
};
export type ControlRoomStore = {
    overview(): Promise<Result<{
        counts: {
            sources: number;
            versions: number;
            chunks: number;
        };
        candidateSummary: {
            sealedInactive: number;
        };
        intakeSummary: {
            total: number;
        };
        availability: {
            metadata: boolean;
            privateUpload: boolean;
            retrieval: false;
            evaluation: false;
        };
    }>>;
    listIntakes(query: {
        status?: string;
        limit: number;
        cursor?: string;
    }): Promise<Result<{
        items: Intake[];
        nextCursor?: string | null;
    }>>;
    getIntake(reference: string): Promise<Result<Intake>>;
    registerLink(input: LinkInput, idempotencyKey: string, inputHash: string): Promise<Result<Intake>>;
    // This operation owns intent/reservation, private write/readback and finalization. It must
    // never retry pending/unknown outcomes or mark an ambiguous write as a known failure.
    upload(input: Metadata & {
        filename: string;
        mediaType: string;
        bytes: Uint8Array;
        fileHash: string;
    }, idempotencyKey: string, inputHash: string): Promise<Result<Intake>>;
    review(reference: string, input: ReviewInput): Promise<Result<Intake>>;
    caseSets(): Promise<Result<CaseSet[]>>;
};
