"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./document-inspector.module.css";
import { filterProductListings, parseDocumentSearch, type DocumentSearchResult } from "./document-library-state";

type DocumentRow = { kind: "product_listing" | "uploaded_document"; title: string; sku?: string; reference?: string; version?: number; sourceVersion?: number; canRetry?: boolean; status: "available" | "prepared" | "processing" | "review_required" | "failed" | "withdrawn"; chunkCount?: number; createdAt?: string };
type DocumentPage = { items: DocumentRow[]; nextCursor: string | null; stats: { productDocuments: number; productChunks?: number; uploadedDocuments: number; uploadedChunks: number } | null; listingsOnly?: boolean };

async function readPage(query: string, cursor: string | null, signal: AbortSignal): Promise<DocumentPage> {
  const params = new URLSearchParams({ limit: "50" });
  if (query.trim()) params.set("q", query.trim());
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/admin/panda-agent/documents?${params}`, { cache: "no-store", signal });
  if (response.status === 503 && !cursor) {
    const fallback = await fetch("/api/admin/panda-agent/corpus", { cache: "no-store", signal });
    if (!fallback.ok) throw Error("Documents unavailable");
    const value: unknown = await fallback.json();
    const products = (value as { products?: unknown })?.products;
    if (!Array.isArray(products) || products.length > 50 || products.some(item => !item || typeof item.title !== "string" || typeof item.sku !== "string")) throw Error("Documents unavailable");
    return { items: filterProductListings(products, query).map(item => ({ kind: "product_listing", title: item.title, sku: item.sku, status: "available" })), nextCursor: null, stats: null, listingsOnly: true };
  }
  if (!response.ok) throw Error("Documents unavailable");
  const value: DocumentPage = await response.json();
  if (!Array.isArray(value?.items) || value.items.some(row => !row || typeof row.title !== "string" || !["product_listing", "uploaded_document"].includes(row.kind) || (row.kind === "product_listing" ? typeof row.sku !== "string" || !row.sku : typeof row.reference !== "string" || !row.reference) || !["available", "prepared", "processing", "review_required", "failed", "withdrawn"].includes(row.status)) || !value.stats || (value.nextCursor !== null && typeof value.nextCursor !== "string")) throw Error("Documents unavailable");
  return value;
}

export function DocumentLibrary({ onInspect, onInspectExternal, onRecover, recoveryDisabled }: { onInspect: (sku: string) => void; onInspectExternal: () => void; onRecover: (reference: string, version: number) => void; recoveryDisabled: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<DocumentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [external, setExternal] = useState<{ reference: string; version: number } | null>(null);
  const generation = useRef(0);
  const moreRequest = useRef<AbortController | null>(null);
  const moreBusy = useRef(false);

  useEffect(() => {
    const refresh = () => { generation.current++; moreRequest.current?.abort(); moreBusy.current = false; setMore(false); setPage(null); setExternal(null); setLoading(true); setError(""); setAttempt(value => value + 1); };
    window.addEventListener("panda-documents-refresh", refresh);
    return () => window.removeEventListener("panda-documents-refresh", refresh);
  }, []);

  useEffect(() => {
    const current = generation.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void readPage(query, null, controller.signal).then(value => {
        if (!controller.signal.aborted && current === generation.current) { setPage(value); setLoading(false); setError(""); }
      }).catch(() => { if (!controller.signal.aborted && current === generation.current) { setLoading(false); setError("Documents could not be loaded. Try again."); } });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); moreRequest.current?.abort(); };
  }, [query, attempt]);

  function search(value: string) {
    if (value === query) return;
    generation.current++; moreRequest.current?.abort(); setMore(false); moreBusy.current = false;
    setQuery(value); setPage(null); setExternal(null); setLoading(true); setError("");
  }
  async function loadMore() {
    if (!page?.nextCursor || moreBusy.current) return;
    const current = generation.current, controller = new AbortController();
    moreRequest.current = controller; moreBusy.current = true; setMore(true);
    try {
      const next = await readPage(query, page.nextCursor, controller.signal);
      if (!controller.signal.aborted && current === generation.current) setPage(previous => { if (!previous) return previous; const seen = new Set(previous.items.map(row => `${row.kind}:${row.sku ?? row.reference}`)); const additions = next.items.filter(row => { const key = `${row.kind}:${row.sku ?? row.reference}`; if (seen.has(key)) return false; seen.add(key); return true; }); return { ...next, items: [...previous.items, ...additions] }; });
    } catch { if (!controller.signal.aborted && current === generation.current) setError("More documents could not be loaded. Try again."); }
    finally { if (moreRequest.current === controller) { moreRequest.current = null; moreBusy.current = false; setMore(false); } }
  }
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : "Unavailable";
  return <section className={styles.library} aria-labelledby="document-library-title">
    <div className={styles.detailHeading}><div><h3 id="document-library-title">Document library</h3><p>Product listings and private submissions. Prepared documents are parsed and chunked, but are not necessarily enabled in live retrieval.</p></div></div>
    {page?.stats && <dl className={styles.libraryStats}><div><dt>Product listings</dt><dd>{count(page.stats.productDocuments)}</dd></div><div><dt>Product chunks</dt><dd>{count(page.stats.productChunks)}</dd></div><div><dt>Uploaded documents</dt><dd>{count(page.stats.uploadedDocuments)}</dd></div><div><dt>Uploaded chunks</dt><dd>{count(page.stats.uploadedChunks)}</dd></div></dl>}
    {page?.listingsOnly && <p role="status">The document library is unavailable. Showing product listings only; uploaded documents and their statistics are unavailable.</p>}
    <label className={styles.search}>Search documents<input type="search" value={query} onChange={event => search(event.target.value)} placeholder="Search by title or SKU" maxLength={100} /></label>
    {loading && <p className={styles.status} role="status">Loading documents…</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p>{!page && <button type="button" onClick={() => { generation.current++; setLoading(true); setError(""); setAttempt(value => value + 1); }}>Retry</button>}</div>}
    {page && <><p className={styles.status}>{page.items.length} documents loaded{page.nextCursor ? "; more available" : ""}.</p><div className={`${styles.tableScroll} ${styles.libraryScroll}`} tabIndex={0} role="region" aria-label="Document library table"><table className={styles.table}><thead><tr><th scope="col">Document</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Chunks</th><th scope="col"><span className={styles.srOnly}>Action</span></th></tr></thead><tbody>{page.items.map((row, index) => <tr key={`${row.kind}-${row.sku ?? row.reference ?? index}`}><th scope="row">{row.title}{row.sku && <p>{row.sku}</p>}</th><td>{row.kind === "product_listing" ? "Product listing" : "Uploaded document"}</td><td>{row.status.replaceAll("_", " ")}{row.canRetry === true && <p>Retry may be available; check status.</p>}</td><td>{count(row.chunkCount)}</td><td>{row.kind === "product_listing" && row.sku ? <button type="button" onClick={() => { setExternal(null); onInspect(row.sku!); }}>Inspect passages</button> : row.kind === "uploaded_document" && row.status === "prepared" && row.reference && Number.isSafeInteger(row.version) && (row.version ?? 0) > 0 ? <button type="button" onClick={() => { onInspectExternal(); setExternal({reference:row.reference!,version:row.version!}); }}>Inspect passages</button> : row.kind === "uploaded_document" && ["processing", "failed"].includes(row.status) && row.reference && Number.isSafeInteger(row.sourceVersion) && (row.sourceVersion ?? 0) > 0 ? <button type="button" disabled={recoveryDisabled} onClick={() => onRecover(row.reference!,row.sourceVersion!)}>Check preparation</button> : null}</td></tr>)}</tbody></table>{!page.items.length && <p className={styles.empty}>No documents match this search.</p>}</div>{page.nextCursor && <button className={styles.more} type="button" disabled={more} onClick={() => void loadMore()}>{more ? "Loading…" : "Load more"}</button>}</>}
    {external && <ExternalDocument key={`${external.reference}:${external.version}`} reference={external.reference} version={external.version} />}
  </section>;
}

function ExternalDocument({ reference, version }: { reference: string; version: number }) {
  const [data, setData] = useState<{ title:string; chunks:{ ordinal:number; text:string; sectionPath:string[] }[] } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [question, setQuestion] = useState("");
  const [searchResult, setSearchResult] = useState<DocumentSearchResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef<AbortController | null>(null);
  useEffect(() => () => searchRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/panda-agent/documents/${encodeURIComponent(reference)}?version=${version}`, { cache:"no-store", signal:controller.signal }).then(async response => {
      if (!response.ok) throw Error();
      const value = await response.json();
      if (value?.reference !== reference || value.version !== version || value.status !== "prepared" || typeof value.title !== "string" || !Array.isArray(value.chunks) || value.chunks.some((chunk: { ordinal?:unknown; text?:unknown; sectionPath?:unknown }) => !Number.isSafeInteger(chunk.ordinal) || typeof chunk.text !== "string" || !Array.isArray(chunk.sectionPath))) throw Error();
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) { setData(null); setError("Prepared passages could not be loaded. They may be unavailable or changed."); } });
    return () => controller.abort();
  }, [reference,version,attempt]);
  async function searchDocument(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || searching) return;
    const trimmed = question.trim();
    if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) { setSearchResult(null); setSearchError("Enter a question without control characters."); return; }
    setSearchResult(null); setSearchError(""); setSearching(true);
    const controller = new AbortController(); searchRequest.current = controller;
    try {
      const response = await fetch(`/api/admin/panda-agent/documents/${encodeURIComponent(reference)}/search`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({question:trimmed,version}), signal:controller.signal });
      if (!response.ok) throw Error();
      const result = parseDocumentSearch(await response.json(),reference,version,data.title);
      if (!result) throw Error();
      if (!controller.signal.aborted) setSearchResult(result);
    } catch { if (!controller.signal.aborted) setSearchError("Document search could not complete. The source may have changed or access may be unavailable."); }
    finally { if (searchRequest.current === controller) { searchRequest.current = null; setSearching(false); } }
  }
  return <section className={styles.detail} aria-label="Prepared document passages"><h3>{data?.title ?? "Prepared document passages"}</h3>{error ? <div role="alert" className={styles.error}><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry</button></div> : !data ? <p role="status">Loading prepared passages…</p> : <><p>Private prepared passages; availability here does not mean they are enabled in live retrieval.</p><form className={styles.documentSearch} onSubmit={searchDocument}><label className={styles.search}>Search this document<input type="text" value={question} maxLength={2000} onChange={event => { searchRequest.current?.abort(); searchRequest.current=null; setSearching(false); setQuestion(event.target.value); setSearchResult(null); setSearchError(""); }} placeholder="Find relevant passages" /></label><button type="submit" disabled={searching || !question.trim()}>{searching ? "Searching…" : "Search passages"}</button></form>{searching && <p role="status">Searching this document…</p>}{searchError && <p role="alert">{searchError}</p>}{searchResult && <div className={styles.searchResults} aria-live="polite"><h4>Search results</h4><p>Lexical matches · relevance unverified. No model answer is generated.</p>{searchResult.passages.length === 0 ? <p>No matching passages were found.</p> : <ol>{searchResult.passages.map(passage => <li key={passage.rank}><strong>Rank {passage.rank} · {passage.source.title} · version {passage.source.version}</strong><p>{passage.source.sectionPath.join(" / ") || "Document"} · passage {passage.source.ordinal}</p><p className={styles.passage}>{passage.text}</p></li>)}</ol>}</div>}<div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Prepared passages table"><table className={styles.table}><thead><tr><th scope="col">Passage</th></tr></thead><tbody>{data.chunks.map(chunk => <tr key={chunk.ordinal}><td><details><summary>{chunk.sectionPath.join(" / ") || "Document"} · Passage {chunk.ordinal}</summary><p className={styles.passage}>{chunk.text}</p></details></td></tr>)}</tbody></table></div></>}</section>;
}
