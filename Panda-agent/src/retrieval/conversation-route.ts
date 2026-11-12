import { resolveChatScope, type ChatScopeProduct } from './chat-scope.ts';

/** Exact phrases that cannot refer to a catalog product or prior product scope. */
export function isUnscopedConversation(question: string) {
  const text = question.normalize('NFKC').toLowerCase().trim();
  return /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening))[!?.\s]*$/.test(text)
      || /^(?:what (?:can you|you can|do you) do(?:\s+(?:actually\w*|for me))?|who are you|(?:what are )?your capabilities|help me get started)[!?.\s]*$/.test(text);
}

const projectSubject = String.raw`(?:my|our) project(?:['\u2019]s)?`;
const projectField = '(?:(?:current|updated|latest|original|previous) )?(?:name|deadline|due date)';
const projectFields = `${projectField}(?: (?:and|or) (?:its |the )?${projectField})?`;
const projectRecall = new RegExp(`^(?:(?:what (?:is|are|was|were)|remind me of|recall) ${projectSubject} ${projectFields}|what (?:is|are|was|were) (?:the )?${projectFields} (?:of|for) ${projectSubject}|when (?:is|was) ${projectSubject} due)[?!.\\s]*$`);

/** Only explicit user project identity/scheduling recall; mixed factual requests do not match. */
export function isProjectMemoryQuestion(question: string): boolean {
  const text = question.normalize('NFKC').toLowerCase().trim()
    .replace(/\s*(?:reply|answer) in (?:one|a)(?: short)? sentence[.!]?$/, '').trim();
  return text.length <= 400 && projectRecall.test(text);
}

/** Lowercased text names the user's own generic board ("my ESP32 board") without asking for its specifications. */
export const ownHardware = (text: string) => /\bmy\s+(?:esp32[\w-]*|ws2812b|grove|rgb)\s+(?:dev(?:elopment)?\s+)?(?:board|module|kit)\b/.test(text) && !/\bspecs?\b|\bspecifications?\b/.test(text);

/** Classify the task, never grant tools or treat conversation history as source evidence. */
export function conversationRoute(question: string, catalog: readonly ChatScopeProduct[], previous?: string) {
  const text = question.normalize('NFKC').toLowerCase().trim();
  if (isUnscopedConversation(question)) return { kind: 'conversation' } as const;
  // Explicit manufacturer lookup bypasses board selection; a chip document is not board proof.
  if ((/\bespressif\b/.test(text) && /\besp(?:32|8266)|\b(?:docs?|documentation|datasheet|official|chip)\b/.test(text)) || /\bofficial\s+manufacturer\b/.test(text)) return { kind: 'manufacturer' } as const;
  const scope = resolveChatScope(question, catalog, previous);
  if (scope.kind === 'resolved' || scope.kind === 'conflict') return scope;
  if (isProjectMemoryQuestion(question)) return { kind: 'conversation' } as const;
  // Request a specific board only when the user actually asks about a product or its specifications.
  if (/\bpanda\s*byte\b|\b(?:sku|this (?:board|product)|its (?:pins?|flash|voltage|memory)|pinout|datasheet|schematic|which (?:board|product)|product specifications?)\b/.test(text)
      // A chip name alone is general electronics ("ESP32 ADC voltage divider"); it asks for a PandaByte board only with a product noun.
      || /\b(?:ws2812b|grove|rgb|esp32(?:[- ]?[a-z]\d+)?)\b/.test(text) && /\b(?:board|module|product|kit|shield|specs?|specifications?)\b/.test(text)
      // "my ESP32 board" is the user's own hardware, not a request for a PandaByte listing, unless specs are asked for.
      && !ownHardware(text)) return scope;
  return { kind: 'conversation' } as const;
}
