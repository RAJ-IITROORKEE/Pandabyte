export type ChatScopeProduct = { sku: string; title: string };
export type ChatScopeResult =
  | { kind: 'resolved'; productSku: string }
  | { kind: 'clarification' | 'conflict'; text: string };

const aliases: Record<string, string[]> = {
  ESPX8266: ['x8266', 'esp8266', 'nodemcu'],
  ESPX32: ['x32'], ESPXS3: ['xs3', 'esp32 s3', 'esp32s3'],
  ESPXC3: ['xc3'], ESPXC3M: ['xc3m'],
  ESPXC5: ['xc5', 'esp32 c5', 'esp32c5'],
  ESPXC6: ['xc6', 'esp32 c6', 'esp32c6'], XLORA: ['xlora'],
  MAKERUNO: ['makeruno', 'maker uno', 'cytron maker uno'],
  RGBWEMOS: ['ws2812b ring', 'ws2812b circular module', 'ws2812b circular'],
};

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function occurrences(haystack: string, needle: string): Array<[number, number]> {
  if (!needle) return [];
  const found: Array<[number, number]> = [];
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    const end = pos + needle.length;
    if ((pos === 0 || haystack[pos - 1] === ' ') && (end === haystack.length || haystack[end] === ' ')) found.push([pos, end]);
    pos = haystack.indexOf(needle, pos + 1);
  }
  return found;
}

/** previousProductSku must come from the caller's authorized server-side history. */
export function resolveChatScope(question: string, catalog: readonly ChatScopeProduct[], previousProductSku?: string | null): ChatScopeResult {
  const text = normalize(question);
  const matches = new Set<string>();
  const spans: Array<[number, number]> = [];
  for (const product of catalog) {
    for (const phrase of [product.sku, product.title]) {
      const needle = normalize(phrase);
      // Short SKUs are not distinctive enough to match ordinary words.
      if (needle.length < 3) continue;
      for (const span of occurrences(text, needle)) {
        matches.add(product.sku);
        spans.push(span);
      }
    }
  }
  const remainder = [...text].map((char, i) => spans.some(([start, end]) => i >= start && i < end) ? ' ' : char).join('');
  for (const product of catalog) {
    for (const alias of aliases[product.sku.toUpperCase()] ?? []) {
      for (const span of occurrences(remainder, alias)) {
        matches.add(product.sku);
        spans.push(span);
      }
    }
  }
  // Generic chip and module names appear in multiple products and cannot select a board.
  const owners = new Map<string, Set<string>>();
  for (const product of catalog) {
    for (const token of normalize(product.title).split(' ')) {
      if (!/^[a-z]{3,}[0-9]{2,}[a-z0-9]*$/.test(token) || token === 'esp32') continue;
      const skus = owners.get(token) ?? new Set<string>();
      skus.add(product.sku);
      owners.set(token, skus);
    }
  }
  for (const [token, skus] of owners) {
    if (skus.size !== 1) continue;
    for (const span of occurrences(remainder, token)) {
      matches.add([...skus][0]);
      spans.push(span);
    }
  }
  const unmatched = [...text].map((char, i) => spans.some(([start, end]) => i >= start && i < end) ? ' ' : char).join('');
  const ambiguous = /(?:^| )(?:ws2812b|grove|rgb|esp32|esp32c3)(?: |$)/.test(unmatched)
    || occurrences(unmatched, 'esp32 c3').length > 0
    || [...owners].some(([token, skus]) => skus.size > 1 && occurrences(unmatched, token).length > 0);
  if (matches.size > 1) return { kind: 'conflict', text: 'Please ask about one product at a time and specify which one.' };
  if (ambiguous) return { kind: 'clarification', text: 'Please specify the exact product name or SKU.' };
  if (matches.size === 1) return { kind: 'resolved', productSku: [...matches][0] };
  // Keep carry-over limited to explicit, short references to the previous product.
  if (previousProductSku && catalog.some(product => product.sku === previousProductSku)
      && text.split(' ').length <= 12
      && /^(?:(?:what|how) about |(?:what|which|how many|does|is|can|tell me about) )?(?:its|it|this board|this product)(?: |$)/.test(text)
      && !/\b(?:other|another|different|instead|versus|vs|arduino|module|sensor|shield|board|product|on|with|for)\b/.test(text.replace(/\bthis (?:board|product)\b/, ''))) {
    return { kind: 'resolved', productSku: previousProductSku };
  }
  return { kind: 'clarification', text: 'Please specify the exact product name or SKU.' };
}
