export function filterProductListings<T extends { title: string; sku: string }>(products: T[], query: string): T[] {
  const term = query.trim().toLowerCase();
  return products.filter(item => !term || item.title.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term));
}

export type DocumentSearchResult = { outcome:'retrieved'|'insufficient'; retrieval:'lexical'; relevance:'unverified'; passages:{ rank:number; text:string; source:{ kind:'uploaded_document'; reference:string; version:number; title:string; ordinal:number; sectionPath:string[] } }[] };
export function parseDocumentSearch(value: unknown, reference: string, version: number, title: string): DocumentSearchResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as DocumentSearchResult;
  if (result.retrieval !== 'lexical' || result.relevance !== 'unverified' || !['retrieved','insufficient'].includes(result.outcome) || !Array.isArray(result.passages) || result.passages.length > 8 || (result.outcome === 'retrieved') !== (result.passages.length > 0)) return null;
  if (result.passages.some((passage, index) => !passage || passage.rank !== index + 1 || typeof passage.text !== 'string' || !passage.text.trim() || passage.text.length > 12000 || !passage.source || passage.source.kind !== 'uploaded_document' || passage.source.reference !== reference || passage.source.version !== version || passage.source.title !== title || !Number.isSafeInteger(passage.source.ordinal) || passage.source.ordinal < 1 || !Array.isArray(passage.source.sectionPath) || passage.source.sectionPath.some(part => typeof part !== 'string'))) return null;
  return result;
}
