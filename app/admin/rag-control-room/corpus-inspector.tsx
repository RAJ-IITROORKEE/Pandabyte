"use client";
import { useEffect, useState } from "react";
import styles from "./document-inspector.module.css";
import { DocumentLibrary } from "./document-library";

type Chunk = { sectionPath: string[]; text: string; physicalRevision: string | null; capturedAt: string };
type Corpus = { selected: null | { title: string; sourceUrl: string; candidateState: string; eligibleChunks: number; excludedChunks: number; chunks: Chunk[] } };

export function CorpusInspector({ onRecover, recoveryDisabled }: { onRecover: (reference:string, version:number) => void; recoveryDisabled:boolean }) {
  const [data, setData] = useState<Corpus | null>(null);
  const [sku, setSku] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!sku) return;
    const controller = new AbortController();
    const url = `/api/admin/panda-agent/corpus?sku=${encodeURIComponent(sku)}`;
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const value: Corpus = await response.json();
      if (!controller.signal.aborted) { setData(value); setError(""); setLoading(false); }
    }).catch(() => { if (!controller.signal.aborted) { setData(previous => previous ? { ...previous, selected: null } : null); setError("Documents could not be loaded. Try again."); setLoading(false); } });
    return () => controller.abort();
  }, [sku, attempt]);
  function select(value: string) { setData(previous => previous ? { ...previous, selected: null } : null); setError(""); setLoading(true); if (value === sku) setAttempt(current => current + 1); else setSku(value); }
  return <section className={styles.inspector} id="inspect">
    <header className={styles.heading}><div><h2>Documents</h2><p>Inspect captured product listings and private submissions. Listing content is not verified hardware documentation.</p></div><span className={styles.tag}>Lexical retrieval</span></header>
    <DocumentLibrary onInspect={select} onInspectExternal={() => { setData(null); setSku(""); setError(""); setLoading(false); }} onRecover={onRecover} recoveryDisabled={recoveryDisabled} />
    {loading && <p className={styles.status} role="status">Loading product passages…</p>}
    {error && <div role="alert" className={styles.error}><p>{error}</p><button type="button" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }}>Retry</button></div>}
    {data && !data.selected && !loading && !error && <p className={styles.status}>No passages are available for this product.</p>}
    {data?.selected && !loading && <section className={styles.detail} aria-label="Selected product passages"><div className={styles.detailHeading}><div><h3>{data.selected.title}</h3><p>{data.selected.eligibleChunks} eligible passages · {data.selected.excludedChunks} excluded · {data.selected.candidateState.replaceAll("_", " ")}</p></div><a href={data.selected.sourceUrl} target="_blank" rel="noreferrer">Open captured listing source</a></div><p className={styles.status}>Physical revision is unknown unless stated. Excluded passages are not shown.</p>{data.selected.chunks.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Eligible passages table"><table className={styles.table}><thead><tr><th scope="col">Passage</th><th scope="col">Physical revision</th><th scope="col">Captured</th></tr></thead><tbody>{data.selected.chunks.map((chunk, index) => <tr key={`${chunk.sectionPath.join("/")}-${index}`}><td><details><summary>{chunk.sectionPath.join(" / ") || "Listing"} · Passage {index + 1}</summary><p className={styles.passage}>{chunk.text}</p></details></td><td>{chunk.physicalRevision ?? "Unknown"}</td><td>{chunk.capturedAt}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>No eligible passages are available for this product.</p>}</section>}
  </section>;
}
