export function cardQuantityValue(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}
