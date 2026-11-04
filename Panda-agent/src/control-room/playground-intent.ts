const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const cases = [
  { id: 'mini-01', productSku: 'ESPX8266', question: 'According to the x8266 listing, what is its flash memory?' },
  { id: 'mini-02', productSku: 'ESPX8266', question: 'According to the x8266 listing, how many years is the warranty for its flash memory?' },
] as const;

export function approvedPlaygroundQuestions(): string[] {
  return cases.map(item => item.question);
}

export function matchApprovedPlaygroundCase(input: { question?: unknown; productSku?: unknown }): 'mini-01' | 'mini-02' | null {
  if (!input || typeof input !== 'object') return null;
  return cases.find(c => c.question === input.question && c.productSku === input.productSku)?.id ?? null;
}

// The receiver must durably bind subject, requestId and caseId, serialize admission,
// and enforce the shared budget plus the at-most-two approved case subset. This is not a ledger.
export function parsePlaygroundIntent(value: unknown): { requestId: string; caseId: 'mini-01' | 'mini-02'; question: string; productSku: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'productSku,question,requestId' || !uuid(input.requestId)) return null;
  const caseId = matchApprovedPlaygroundCase(input);
  if (!caseId || typeof input.question !== 'string' || typeof input.productSku !== 'string') return null;
  return { requestId: input.requestId.toLowerCase(), caseId, question: input.question, productSku: input.productSku };
}

