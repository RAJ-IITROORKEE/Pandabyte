export type ContextSummary = {
    fragments: number;
    characters: number;
    duplicatesRemoved: number;
    limitCharacters: 20000;
    retrievalMs?: number;
    requestElapsedMs?: number;
};

export function isContextSummary(value: unknown): value is ContextSummary {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    if (!['fragments', 'characters', 'duplicatesRemoved', 'limitCharacters'].every(key => Object.hasOwn(v, key))
        || Object.keys(v).some(key => !['fragments', 'characters', 'duplicatesRemoved', 'limitCharacters', 'retrievalMs', 'requestElapsedMs'].includes(key))) return false;
    for (const key of ['retrievalMs','requestElapsedMs']) if (Object.hasOwn(v,key) && (!Number.isSafeInteger(v[key]) || (v[key] as number)<0 || (v[key] as number)>120000)) return false;
    if(v.requestElapsedMs!==undefined && (v.retrievalMs===undefined || (v.requestElapsedMs as number)<(v.retrievalMs as number)))return false;
    return Number.isInteger(v.fragments) && (v.fragments as number) >= 1 && (v.fragments as number) <= 8
        && Number.isInteger(v.characters) && (v.characters as number) >= (v.fragments as number) && (v.characters as number) <= 20000
        && Number.isInteger(v.duplicatesRemoved) && (v.duplicatesRemoved as number) >= 0 && (v.duplicatesRemoved as number) <= 7
        && (v.fragments as number) + (v.duplicatesRemoved as number) <= 8
        && v.limitCharacters === 20000;
}
