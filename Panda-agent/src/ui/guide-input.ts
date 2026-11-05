export type GuideInput = { goal: string; board: string; revision?: string; components: string[]; expectedVersion: number };
export type MessageInput = { guide: GuideInput } | { question: string; webSearch: boolean };
export function guideDisabled(status: number, value: unknown): boolean {
  return status === 409 && !!value && typeof value === "object" && !Array.isArray(value) && (value as { error?: unknown }).error === "guide_disabled";
}
export function messagePayload(requestId: string, input: MessageInput) {
  return "guide" in input ? { requestId, guide: input.guide } : { requestId, question: input.question, ...(input.webSearch ? { webSearch: true } : {}) };
}

export function prepareGuideInput(goal: string, board: string, revision: string, componentLines: string, expectedVersion: number): GuideInput | null {
  goal = goal.trim(); board = board.trim(); revision = revision.trim();
  const components = componentLines.split("\n").map(value => value.trim()).filter(Boolean);
  const fields = [goal, board, revision, ...components];
  if (!goal || goal.length > 600 || !board || board.length > 128 || revision.length > 80 || components.length > 8 || components.some(value => value.length > 80) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || fields.some(value => /[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")))) return null;
  return { goal, board, ...(revision ? { revision } : {}), components, expectedVersion };
}
