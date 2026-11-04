export function uploadOutcome(value: unknown): 'saved' | 'failed' | 'unknown' {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  const item = value as Record<string, unknown>;
  if (item.kind !== 'upload') return 'unknown';
  if (item.status === 'pending_review') return 'saved';
  if (item.status === 'upload_failed') return 'failed';
  return 'unknown';
}

export function omitBlankOptionalFields(data: FormData): void {
  for (const name of ['publisher', 'purpose', 'rightsEvidence']) {
    const value = data.get(name);
    if (typeof value === 'string' && !value.trim()) data.delete(name);
  }
}

export function normalizeLineBreaks(value: FormDataEntryValue | null): FormDataEntryValue | null {
  return typeof value === 'string' ? value.replace(/\r?\n/g, ' ') : value;
}

export function reviewOutcome(status: number): 'saved' | 'rejected' | 'unknown' {
  if (status >= 200 && status < 300) return 'saved';
  if ([400, 401, 403, 404, 405, 409, 413, 415].includes(status)) return 'rejected';
  return 'unknown';
}

export function isPreparedDocument(value: unknown, reference: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return result.status === 'prepared' && result.reference === reference && Number.isSafeInteger(result.version) && (result.version as number) > 0;
}

export type PendingPreparation = { reference: string; expectedVersion: number };
export function validateIntakeFile(files: ArrayLike<Pick<File, 'name' | 'size' | 'type'>> | null): string {
  const file = files?.[0];
  if (!file || files?.length !== 1) return 'Choose exactly one document.';
  const ext = file.name.toLowerCase().split('.').pop();
  if (file.size < 1 || file.size > 3145728) return 'Choose a nonempty document no larger than 3 MiB.';
  if (!((ext === 'pdf' && file.type === 'application/pdf') || (ext === 'txt' && file.type === 'text/plain') || (ext === 'md' && ['text/markdown', 'text/plain'].includes(file.type)))) return 'Choose a PDF, Markdown or text file with a supported file type.';
  return '';
}
export function parsePendingPreparation(value: unknown): PendingPreparation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'expectedVersion,reference' || typeof row.reference !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.reference) || !Number.isSafeInteger(row.expectedVersion) || (row.expectedVersion as number) < 1) return null;
  return { reference: row.reference, expectedVersion: row.expectedVersion as number };
}

export function preparationStatus(value: unknown, pending: PendingPreparation): 'prepared' | 'retry' | 'waiting' | 'unknown' {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'unknown';
  const row = value as Record<string, unknown>;
  if (row.reference !== pending.reference || row.sourceVersion !== pending.expectedVersion || typeof row.canRetry !== 'boolean') return 'unknown';
  if (row.status === 'prepared' && row.canRetry === false && Number.isSafeInteger(row.version) && (row.version as number) > 0 && Number.isSafeInteger(row.chunkCount) && (row.chunkCount as number) > 0) return 'prepared';
  if (['not_started', 'processing', 'failed'].includes(row.status as string)) return row.canRetry ? 'retry' : 'waiting';
  if (row.status === 'withdrawn' && row.canRetry === false) return 'waiting';
  return 'unknown';
}
