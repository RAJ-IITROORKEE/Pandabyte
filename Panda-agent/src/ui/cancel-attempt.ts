export function createAttemptGuard() {
  let epoch = 0;
  return {
    begin(threadId: string, requestId: string) { return { threadId, requestId, epoch: epoch++ }; },
    invalidate() { epoch++; },
    current(attempt: { epoch: number }) { return attempt.epoch === epoch - 1; },
  };
}

type Attempt = { threadId: string; requestId: string; epoch: number };
export function completedAttempt(current: Attempt | null, queried: Attempt, status: unknown): boolean {
  return status === 'complete' && current?.threadId === queried.threadId && current.requestId === queried.requestId && current.epoch === queried.epoch;
}
