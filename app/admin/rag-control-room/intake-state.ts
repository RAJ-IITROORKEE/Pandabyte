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
