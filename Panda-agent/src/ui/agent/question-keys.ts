/** Maps a "1".."9" key press to an option index, or null when it selects nothing. */
export function optionForKey(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < count ? index : null;
}

/** Roving-focus target for arrow/Home/End keys over `total` rows (wraps), or null for other keys. */
export function focusForKey(key: string, current: number, total: number): number | null {
  if (total < 1) return null;
  if (key === 'ArrowDown') return (current + 1) % total;
  if (key === 'ArrowUp') return (current - 1 + total) % total;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return null;
}

export function foldedText(count: number): string {
  return `${count} ${count === 1 ? 'question' : 'questions'} waiting`;
}

export function askedText(question: string, state: 'waiting' | 'answered'): string {
  const q = question.length > 60 ? `${question.slice(0, 59).trimEnd()}…` : question;
  return `Asked: ${q} · ${state === 'waiting' ? 'waiting' : 'answered below'}`;
}
