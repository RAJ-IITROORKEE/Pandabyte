// One reviewed synonym, applied as a whole word on both sides of lexical matching.
export const normalizeLexicalTerm = (term: string) => term === 'microprocessor' ? 'processor' : term;
export const matchesLexicalTerm = (term: string, text: string) => new RegExp(term === 'processor' ? '\\b(?:processor|microprocessor)\\b' : `\\b${term}\\b`).test(text);
