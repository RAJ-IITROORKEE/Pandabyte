export type ContextSummary = {
    fragments: number;
    characters: number;
    duplicatesRemoved: number;
    limitCharacters: 20000;
};

export function isContextSummary(value: unknown): value is ContextSummary {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    if (Object.keys(v).length !== 4 || !['fragments', 'characters', 'duplicatesRemoved', 'limitCharacters'].every(key => Object.hasOwn(v, key))) return false;
    return Number.isInteger(v.fragments) && (v.fragments as number) >= 1 && (v.fragments as number) <= 8
        && Number.isInteger(v.characters) && (v.characters as number) >= (v.fragments as number) && (v.characters as number) <= 20000
        && Number.isInteger(v.duplicatesRemoved) && (v.duplicatesRemoved as number) >= 0 && (v.duplicatesRemoved as number) <= 7
        && (v.fragments as number) + (v.duplicatesRemoved as number) <= 8
        && v.limitCharacters === 20000;
}
