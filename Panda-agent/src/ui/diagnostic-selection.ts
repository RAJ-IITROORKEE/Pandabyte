export function createSelectionGuard() {
  let generation = 0;
  return { begin: () => ++generation, invalidate: () => { generation++; }, current: (ticket: number) => ticket === generation };
}

export function updateMatchingAsset<T extends { assetId: string }>(current: T | null, assetId: string, update: (value: T) => T | null): T | null {
  return current?.assetId === assetId ? update(current) : current;
}
