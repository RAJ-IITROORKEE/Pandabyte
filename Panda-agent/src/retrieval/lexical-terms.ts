export function normalizeLexicalTerm(term: string): string {
    if (term === 'microprocessor') return 'processor';
    if (term === 'mcu') return 'microcontroller';
    return term;
}

export function matchesLexicalTerm(term: string, text: string): boolean {
    if (term === 'processor') return /\b(?:processor|microprocessor)\b/.test(text);
    if (term === 'microcontroller') return /\b(?:mcu|microcontroller)\b/.test(text);
    return new RegExp(`\\b${term}\\b`).test(text);
}
