export function filterProductListings<T extends { title: string; sku: string }>(products: T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  return products.filter(item => !term || item.title.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term));
}

export type DocumentSearchResult = { outcome:'retrieved'|'insufficient'; retrieval:'lexical'; relevance:'unverified'; passages:{ rank:number; text:string; source:{ kind:'uploaded_document'; reference:string; version:number; title:string; ordinal:number; sectionPath:string[] } }[] };
export function parseDocumentSearch(value: unknown, reference: string, version: number, title: string): DocumentSearchResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as DocumentSearchResult;
  if (result.retrieval !== 'lexical' || result.relevance !== 'unverified' || !['retrieved','insufficient'].includes(result.outcome) || !Array.isArray(result.passages) || result.passages.length > 8 || (result.outcome === 'retrieved') !== (result.passages.length > 0)) return null;
  if (result.passages.some((passage, index) => !passage || passage.rank !== index + 1 || typeof passage.text !== 'string' || !passage.text.trim() || passage.text.length > 12000 || !passage.source || passage.source.kind !== 'uploaded_document' || passage.source.reference !== reference || passage.source.version !== version || passage.source.title !== title || !Number.isSafeInteger(passage.source.ordinal) || passage.source.ordinal < 1 || !Array.isArray(passage.source.sectionPath) || passage.source.sectionPath.some(part => typeof part !== 'string'))) return null;
  return result;
}

export type WithdrawalReceipt = { reference: string; expectedVersion: number };
type WithdrawalGuard = WithdrawalReceipt & { rejected?: 'denied' | 'conflict' };
export type WithdrawalState = { phase: 'idle' | 'unknown' | 'denied' | 'conflict' | 'review' | 'confirmed' | 'storage'; pending: WithdrawalReceipt | null; busy: boolean; fresh: { title: string; version: number } | null };
type WithdrawalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const withdrawalKey = 'panda-document-pending-withdrawal';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const documentVersion = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
export function parseWithdrawalReceipt(value: unknown): WithdrawalReceipt | null {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'expectedVersion,reference' || typeof value.reference !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.reference) || !documentVersion(value.expectedVersion) || value.expectedVersion >= Number.MAX_SAFE_INTEGER) return null;
  return { reference: value.reference, expectedVersion: value.expectedVersion };
}

// One guarded operation; status checks use only bounded fresh list metadata, never preparation sourceVersion.
export function createDocumentWithdrawal(storage: WithdrawalStorage, transport: typeof fetch = fetch) {
  let state: WithdrawalState = { phase: 'idle', pending: null, busy: false, fresh: null };
  let rejected: WithdrawalGuard['rejected'];
  let stored: string | null = null;
  try {
    const raw = storage.getItem(withdrawalKey);
    stored = raw;
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      if (!object(value) || Object.keys(value).some(key => !['reference', 'expectedVersion', 'rejected'].includes(key)) || (value.rejected !== undefined && !['denied', 'conflict'].includes(value.rejected as string))) throw Error();
      const pending = parseWithdrawalReceipt({ reference: value.reference, expectedVersion: value.expectedVersion });
      if (!pending) throw Error();
      rejected = value.rejected as WithdrawalGuard['rejected'];
      state = { ...state, pending, phase: rejected ?? 'unknown' };
    }
  } catch { state = { ...state, phase: 'storage' }; }

  function persist(value: WithdrawalGuard) {
    if (storage.getItem(withdrawalKey) !== stored) throw Error();
    const raw = JSON.stringify(value); storage.setItem(withdrawalKey, raw);
    if (storage.getItem(withdrawalKey) !== raw) throw Error();
    stored = raw;
  }

  function confirmed() {
    state = { ...state, phase: 'confirmed', fresh: null };
    try { if (storage.getItem(withdrawalKey) !== stored) throw Error(); storage.removeItem(withdrawalKey); if (storage.getItem(withdrawalKey) !== null) throw Error(); stored = null; state = { ...state, pending: null }; rejected = undefined; }
    catch { /* Keep the verified state and receipt until storage cleanup succeeds. */ }
  }
  return {
    snapshot: (): WithdrawalState => ({ ...state, pending: state.pending ? { ...state.pending } : null, fresh: state.fresh ? { ...state.fresh } : null }),
    async submit(input: WithdrawalReceipt) {
      const pending = parseWithdrawalReceipt(input);
      if (state.busy || !pending || !['idle', 'review', 'confirmed'].includes(state.phase) || (state.phase === 'confirmed' && state.pending) || (state.phase === 'review' && (pending.reference !== state.pending?.reference || pending.expectedVersion !== state.fresh?.version))) return;
      state = { ...state, busy: true, fresh: null };
      try {
        try { persist(pending); }
        catch { state = { ...state, phase: 'storage' }; return; }
        rejected = undefined;
        state = { ...state, pending, phase: 'unknown' };
        const response = await transport(`/api/admin/panda-agent/documents/${encodeURIComponent(pending.reference)}/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: pending.expectedVersion }), cache: 'no-store', signal: AbortSignal.timeout(30000) });
        if ([401, 403, 409].includes(response.status)) {
          rejected = response.status === 409 ? 'conflict' : 'denied';
          state = { ...state, phase: rejected };
          // Retain definite rejection across reload, but never weaken it without a fresh Admin metadata read.
          try { persist({ ...pending, rejected }); } catch { rejected = undefined; state = { ...state, phase: 'unknown' }; }
          return;
        }
        if (response.status !== 200) return;
        const value: unknown = await response.json();
        if (object(value) && value.reference === pending.reference && value.status === 'withdrawn' && value.version === pending.expectedVersion + 1) confirmed();
      } catch { /* A dispatched or malformed response is unknown; never retry it automatically. */ }
      finally { state = { ...state, busy: false }; }
    },
    async check() {
      if (state.busy || !state.pending || state.phase === 'storage') return;
      if (state.phase === 'confirmed') { confirmed(); return; }
      state = { ...state, phase: rejected ?? 'unknown', busy: true, fresh: null };
      const signal = AbortSignal.timeout(10000), seen = new Set<string>();
      let cursor: string | null = null;
      try {
        for (let page = 0; page < 5; page++) {
          const params = new URLSearchParams({ limit: '50' });
          if (cursor) params.set('cursor', cursor);
          const response = await transport(`/api/admin/panda-agent/documents?${params}`, { cache: 'no-store', signal });
          if (response.status === 401 || response.status === 403) { state = { ...state, phase: 'denied' }; return; }
          if (!response.ok) return;
          const value: unknown = await response.json();
          if (signal.aborted || !object(value) || value.listingsOnly === true || !object(value.stats) || !Array.isArray(value.items) || value.items.length > 50 || (value.nextCursor !== null && (typeof value.nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,2048}$/.test(value.nextCursor)))) return;
          const matching = value.items.filter(row => object(row) && row.kind === 'uploaded_document' && row.reference === state.pending?.reference);
          if (matching.length > 1) return;
          const row = matching[0];
          if (object(row)) {
            if (!documentVersion(row.version) || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 300 || /[\u0000-\u001f\u007f]|\p{Surrogate}/u.test(row.title)) return;
            if (row.status === 'withdrawn' && row.version > state.pending!.expectedVersion) { confirmed(); return; }
            if (row.status === 'prepared' && rejected) state = { ...state, phase: 'review', fresh: { title: row.title, version: row.version } };
            return;
          }
          if (value.nextCursor === null || seen.has(value.nextCursor as string)) return;
          cursor = value.nextCursor as string; seen.add(cursor);
        }
      } catch { /* Readback unavailable: retain the mutation guard. */ }
      finally { state = { ...state, busy: false }; }
    },
  };
}
