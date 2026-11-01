"use client";
import { useEffect, useState } from "react";
import styles from "./rag-control-room.module.css";

type Product = { sku: string; title: string };
type Chunk = { sectionPath: string[]; text: string; physicalRevision: string | null; capturedAt: string };
type Corpus = { products: Product[]; selected: null | { title: string; sourceUrl: string; candidateState: string; eligibleChunks: number; excludedChunks: number; chunks: Chunk[] }; runtime: { available: boolean; retrievalMethod: string } };

export function CorpusInspector() {
  const [data, setData] = useState<Corpus | null>(null);
  const [sku, setSku] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/admin/panda-agent/corpus${sku ? `?sku=${encodeURIComponent(sku)}` : ""}`;
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const value = await response.json();
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(() => { if (!controller.signal.aborted) { setData(previous => previous ? { ...previous, selected: null } : null); setError("Source inspection is unavailable. Please try again."); } });
    return () => controller.abort();
  }, [sku, attempt]);
  return <section className={`${styles.panel} ${styles.wide}`} id="inspect">
    <h2>Inspect captured product documents</h2>
    <p>Private engineering preview of listing evidence. Physical revisions are unknown unless shown; this is not verified wiring guidance.</p>
    <div className={styles.form}><label>Product<select value={sku} onChange={event => { setData(previous => previous ? { ...previous, selected: null } : null); setSku(event.target.value); }}><option value="">Choose a product</option>{data?.products.map(product => <option key={product.sku} value={product.sku}>{product.title}</option>)}</select></label></div>
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>}
    {data && <p>Runtime connection: {data.runtime.available ? "connected" : "unavailable"} · Lexical retrieval · candidate sealed and inactive. A connection does not confirm model availability.</p>}
    {data?.selected && <div><h3>{data.selected.title}</h3><p>{data.selected.eligibleChunks} eligible passages · {data.selected.excludedChunks} excluded · {data.selected.candidateState.replaceAll("_", " ")}</p><p><a href={data.selected.sourceUrl} target="_blank" rel="noreferrer">Open captured listing source</a></p><ul className={styles.list}>{data.selected.chunks.map((chunk, index) => <li key={`${chunk.sectionPath.join("/")}-${index}`}><div><strong>{chunk.sectionPath.join(" / ") || "Listing"}</strong><p>Physical revision: {chunk.physicalRevision ?? "unknown"} · captured {chunk.capturedAt}</p><p style={{ whiteSpace: "pre-wrap" }}>{chunk.text}</p></div></li>)}</ul></div>}
  </section>;
}
