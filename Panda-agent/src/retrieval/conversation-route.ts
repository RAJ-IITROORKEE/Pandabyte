import { resolveChatScope, type ChatScopeProduct } from './chat-scope.ts';

/** Exact phrases that cannot refer to a catalog product or prior product scope. */
export function isUnscopedConversation(question: string) {
  const text = question.normalize('NFKC').toLowerCase().trim();
  return /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening))[!?.\s]*$/.test(text)
      || /^(?:what (?:can you|you can|do you) do(?:\s+(?:actually\w*|for me))?|who are you|(?:what are )?your capabilities|help me get started)[!?.\s]*$/.test(text);
}

/** Classify the task, never grant tools or treat conversation history as source evidence. */
export function conversationRoute(question: string, catalog: readonly ChatScopeProduct[], previous?: string) {
  const text = question.normalize('NFKC').toLowerCase().trim();
  if (isUnscopedConversation(question)) return { kind: 'conversation' } as const;
  // Explicit manufacturer lookup bypasses board selection; a chip document is not board proof.
  if ((/\bespressif\b/.test(text) && /\besp(?:32|8266)|\b(?:docs?|documentation|datasheet|official|chip)\b/.test(text)) || /\bofficial\s+manufacturer\b/.test(text)) return { kind: 'manufacturer' } as const;
  const scope = resolveChatScope(question, catalog, previous);
  if (scope.kind === 'resolved' || scope.kind === 'conflict') return scope;
  // Request a specific board only when the user actually asks about a product or its specifications.
  if (/\bpanda\s*byte\b|\b(?:sku|this (?:board|product)|its (?:pins?|flash|voltage|memory)|pinout|datasheet|schematic|which (?:board|product)|product specifications?)\b/.test(text)
      || /\b(?:ws2812b|grove|rgb|esp32(?:[- ]?[a-z]\d+)?)\b/.test(text) && /\b(?:board|module|product|pin|pins|voltage|flash|memory|specs?|specifications?)\b/.test(text)) return scope;
  return { kind: 'conversation' } as const;
}
