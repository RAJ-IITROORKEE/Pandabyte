"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./playground.module.css";
import { PlaygroundToolFixture } from "./playground-tool-fixture";

type Passage = { rank: number; title: string; sourceUrl: string; capturedAt: string; sectionPath: string[]; text: string; productSku?: string; productTitle?: string; lexicalOverlap: { matched: number; total: number } };
type Result = { outcome: "retrieved" | "clarification" | "conflict" | "insufficient"; passages: Passage[]; products?: { sku: string; title: string }[]; workflow?: { stage: "authorize" | "retrieve" | "augment" | "generate" | "validate" | "release"; status: "completed" | "skipped"; elapsedMs: number }[]; retrieval: "lexical"; relevance: "unverified"; metrics?: { elapsedMs: number; contextPassages: number; contextCharacters: number; inputTokens: number | null; outputTokens: number | null; costUsd: number | null; admissionMs?: number | null; providerRoundTripMs?: number | null; contextRevalidationMs?: number | null; contextRevalidationCount?: number }; model: { status: "not_requested" | "guard_unavailable" } | { status: "not_run"; reason?: "multi_product_guard_unavailable" | "no_retrieved_context" } | { status: "evaluated"; answer: string; evidence: { rank: number; quote: string; reason: string }[] } };
type Capability = { model: "openai/gpt-4o-mini" | "xingchen-agi/xing4.0-29b-a4b:free" | "openai/gpt-6-luna"; connection: "not_configured" | "configured_unverified"; transport: "unconfigured" | "hosted" | "local"; profile: "mini-two-case-v1" | "product-playground-v1" | "basic-rag-v1" | "luna-rag-test-v1" | "luna-rag-prototype-v1" | null; approvedQuestions: string[]; remainingNanoUsd?: number; expiresAt?: string };
const outcomeKey = "panda-playground-unknown-outcome";

export function Playground({ toolFixture = false }: { toolFixture?: boolean }) {
  const [question, setQuestion] = useState("");
  const [evaluate, setEvaluate] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [guardReady, setGuardReady] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityAttempt, setCapabilityAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [completedAt, setCompletedAt] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const capabilityRequest = useRef<AbortController | null>(null);
  const evaluationId = useRef<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try { if (sessionStorage.getItem(outcomeKey) !== null) { setUnknownOutcome(true); setEvaluate(false); } }
      catch { setUnknownOutcome(true); setEvaluate(false); }
      setGuardReady(true);
    });
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    capabilityRequest.current = controller;
    fetch("/api/admin/panda-agent/playground", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error();
        const value = await response.json();
        if (!["openai/gpt-4o-mini", "xingchen-agi/xing4.0-29b-a4b:free", "openai/gpt-6-luna"].includes(value?.model) || !["not_configured", "configured_unverified"].includes(value.connection) || !["unconfigured", "hosted", "local"].includes(value.transport) || ![null, "mini-two-case-v1", "product-playground-v1", "basic-rag-v1", "luna-rag-test-v1", "luna-rag-prototype-v1"].includes(value.profile) || !Array.isArray(value.approvedQuestions) || value.approvedQuestions.length > 2 || value.approvedQuestions.some((question: unknown) => typeof question !== "string" || question.length > 2000)) throw Error();
        if (value.remainingNanoUsd !== undefined && (!Number.isSafeInteger(value.remainingNanoUsd) || value.remainingNanoUsd < 0 || value.remainingNanoUsd > 1000000000)) throw Error();
        if (value.expiresAt !== undefined && (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)))) throw Error();
        if (value.profile === "luna-rag-prototype-v1" && (value.remainingNanoUsd === undefined || value.expiresAt === undefined)) throw Error();
        if (!controller.signal.aborted) { setCapability(value); setCapabilityError(false); if (value.connection !== "configured_unverified") setEvaluate(false); }
      })
      .catch(() => { if (!controller.signal.aborted) setCapabilityError(true); });
    return () => { controller.abort(); if (capabilityRequest.current === controller) capabilityRequest.current = null; };
  }, [capabilityAttempt]);

  const modelAvailable = capability?.connection === "configured_unverified" && (["mini-two-case-v1", "product-playground-v1", "basic-rag-v1", "luna-rag-test-v1", "luna-rag-prototype-v1"].includes(capability.profile ?? "")) && capability.transport !== "unconfigured";
  const canEvaluate = guardReady && !unknownOutcome && modelAvailable;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = question.trim();
    if (!query || busy || (evaluate && !canEvaluate)) return;
    if (evaluate) {
      try {
        evaluationId.current ??= crypto.randomUUID();
        sessionStorage.setItem(outcomeKey, "1");
      } catch { setUnknownOutcome(true); setEvaluate(false); return; }
    }
    const lock = () => { setUnknownOutcome(true); setEvaluate(false); };
    const clearGuard = () => {
      try { sessionStorage.removeItem(outcomeKey); return true; }
      catch { lock(); return false; }
    };
    setResult(null); setCompletedAt(""); setCopyStatus(""); setError(""); setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/admin/panda-agent/playground", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ question: query, ...(evaluate ? { evaluate: true, requestId: evaluationId.current } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (!controller.signal.aborted && evaluate) { if (["quota", "not_admitted"].includes(data?.error?.code)) clearGuard(); else lock(); }
        if (!controller.signal.aborted) setError(data?.error?.code === "not_admitted" ? capability?.profile === "mini-two-case-v1" ? "No model request was admitted. Use an approved validation question or inspect retrieval." : "No model request was admitted. Check the profile and allowance, or inspect retrieval." : data?.error?.code === "quota" ? "Model quota is unavailable or exhausted. No automatic retry was made." : data?.error?.code === "outcome_unknown" ? "The model call outcome is unknown. Check its status before submitting again; no automatic retry was made." : evaluate ? "The request could not be completed. The model call may have an unknown outcome; check its status before submitting again." : "The playground could not retrieve results. Check your access and try again.");
        return;
      }
      const data = await response.json();
      if (!controller.signal.aborted) {
        if (!data?.model || !["not_requested", "guard_unavailable", "not_run", "evaluated"].includes(data.model.status)) {
          if (evaluate) lock();
          setError("The response could not be understood. Check its status before submitting again.");
        } else {
          if (evaluate && clearGuard() && data.model.status === "evaluated") evaluationId.current = null;
          setCompletedAt(new Date().toLocaleTimeString());
          setResult(data);
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        if (evaluate) lock();
        setError(evaluate ? "The request could not be completed. The model call may have an unknown outcome; check its status before submitting again." : "The playground could not retrieve results. Check your access and try again.");
      }
    } finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); if (evaluate) setCapabilityAttempt(value => value + 1); } }
  }

  const metric = (value: number | null | undefined, suffix = "") => typeof value === "number" && Number.isFinite(value) && value >= 0 ? `${value.toLocaleString()}${suffix}` : "Unavailable";
  const metrics = result?.metrics;
  return <section className={styles.playground} id="playground">
    <div className={styles.heading}><div><h2>Retrieval playground</h2><p>Inspect retrieved context before reviewing a model answer.</p></div><span className={styles.tag}>Lexical retrieval</span></div>
    {toolFixture && <PlaygroundToolFixture />}
    <div className={styles.workbench}>
      <form className={styles.form} onSubmit={submit}>
        <label>Your query<textarea name="question" autoComplete="off" placeholder="Ask about a product specification…" aria-describedby="query-help" value={question} onChange={event => { if (!unknownOutcome) evaluationId.current = null; setQuestion(event.target.value); setResult(null); setError(""); }} maxLength={2000} required disabled={busy} /></label>
        <p id="query-help">Include one or more exact product names, models or SKUs in your query.</p>
        <div className={styles.evaluation}>
          <label className={styles.checkOption}>
            <input name="evaluate" type="checkbox" checked={evaluate} onChange={event => { setEvaluate(event.target.checked); setResult(null); setError(""); }} disabled={busy || !canEvaluate} aria-describedby="evaluation-help" />
            <span>Also generate a grounded answer</span>
          </label>
          <p id="evaluation-help" role="status">{unknownOutcome
            ? "A previous evaluation may have an unknown outcome, or session storage is unavailable. Check the server-side status before evaluating again. Retrieval remains available."
            : capabilityError ? "Model status could not be checked. Retrieval remains available."
            : !capability ? "Checking model availability. You can inspect retrieval now."
            : !modelAvailable ? capability.model === "openai/gpt-6-luna" ? "Prototype admission is off: privacy verification or budget is unavailable. You can inspect retrieval now." : "Model evaluation is off pending verification of zero cost and zero data retention. You can inspect retrieval now."
            : capability.profile === "luna-rag-prototype-v1" ? `GPT-6 Luna · strict ZDR · $1 total prototype cap. Conservative allowance remaining (USD): ${((capability.remainingNanoUsd ?? 0) / 1e9).toFixed(3)}. Privacy verification expires at ${new Date(capability.expiresAt!).toLocaleTimeString()}. No automatic retry.`
            : capability.profile === "luna-rag-test-v1" ? "GPT-6 Luna · strict ZDR · approved test budget only. No automatic retry."
            : capability.profile === "basic-rag-v1" ? "Xing 4.0 · zero cost · strict ZDR. Provider capacity is checked for each request."
            : capability.profile === "mini-two-case-v1" ? "Only the approved questions below can be evaluated within the profile allowance."
            : "Evaluation is optional and subject to the configured profile allowance."}</p>
        </div>
        <div className={styles.presets}><button type="button" disabled={busy} onClick={() => { capabilityRequest.current?.abort(); setEvaluate(false); setCapability(null); setCapabilityError(false); setCapabilityAttempt(value => value + 1); }}>Refresh connection</button></div>
        {capability?.profile === "mini-two-case-v1" && capability.approvedQuestions.length > 0 && <div className={styles.presets}><p>Approved evaluation questions. For other queries, uncheck evaluation to inspect retrieval.</p>{capability.approvedQuestions.map(preset => <button key={preset} type="button" disabled={busy} onClick={() => { if (!unknownOutcome) evaluationId.current = null; setQuestion(preset); setResult(null); setError(""); }}>{preset}</button>)}</div>}
        <button type="submit" disabled={busy || !question.trim() || (evaluate && !canEvaluate)}>{busy ? "Running…" : evaluate ? "Inspect and evaluate" : "Inspect retrieval"}</button>
      </form>
      <div className={styles.output} aria-live="polite" aria-busy={busy}>
        <div className={styles.outputHeading}><h3>Output &amp; evidence</h3>{completedAt && result && <span>Completed at {completedAt} (local time)</span>}</div>
        <dl className={styles.metrics}>
          <div><dt>Elapsed</dt><dd>{metric(metrics?.elapsedMs, " ms")}</dd></div><div><dt>Context passages</dt><dd>{metric(metrics?.contextPassages)}</dd></div><div><dt>Context characters</dt><dd>{metric(metrics?.contextCharacters)}</dd></div><div><dt>Input tokens</dt><dd>{metric(metrics?.inputTokens)}</dd></div><div><dt>Output tokens</dt><dd>{metric(metrics?.outputTokens)}</dd></div><div><dt>Guard-accounted cost (USD)</dt><dd>{typeof metrics?.costUsd === "number" && Number.isFinite(metrics.costUsd) && metrics.costUsd >= 0 ? `$${metrics.costUsd.toLocaleString(undefined, { maximumFractionDigits: 9 })}` : "Unavailable"}</dd></div>
          <div><dt>Admission checks</dt><dd>{metric(metrics?.admissionMs, " ms")}</dd></div><div><dt>Model round trip</dt><dd>{metric(metrics?.providerRoundTripMs, " ms")}</dd></div><div><dt>Context revalidation</dt><dd>{metric(metrics?.contextRevalidationMs, " ms")}</dd></div>
        </dl>
        {typeof metrics?.providerRoundTripMs === "number" && <p>Model round trip includes network and response transfer. Context checks can overlap admission time.</p>}
        {typeof metrics?.costUsd === "number" && Number.isFinite(metrics.costUsd) && metrics.costUsd >= 0 && <p>Guard-accounted cost is not a provider invoice.</p>}
        {busy ? <p role="status">{evaluate ? "Retrieving passages and evaluating…" : "Retrieving passages…"}</p> : error ? <p role="alert">{error}</p> : !result ? <div className={styles.empty}><h4>Ready for a query</h4><p>Results, source citations and measured usage appear here after a run.</p></div> : <div className={styles.results}>
          <p><strong>Outcome:</strong> {result.outcome.replaceAll("_", " ")} · <strong>Relevance:</strong> {result.relevance}</p>
          {result.outcome === "clarification" && <p>Use a more precise product name, model or SKU; a shared family name such as ESP32 may identify several products.</p>}
          {result.outcome === "conflict" && <p>The product identities could not be resolved safely. Use exact product names, models or SKUs.</p>}
          {result.outcome === "insufficient" && result.passages.length === 0 && <p>No supporting passages were found. Include the exact product model and the specification you need.</p>}
          {result.products && result.products.length > 0 && <p><strong>Products:</strong> {result.products.map(product => `${product.title} (${product.sku})`).join(" · ")}</p>}
          <h4>Grounded model answer</h4>
          {result.model.status === "not_requested" ? <p>No model answer yet. This was a retrieval-only request.</p> : result.model.status === "guard_unavailable" ? <p>Model output unavailable: the model execution guard is unavailable. No model was called.</p> : result.model.status === "not_run" ? <p>{result.model.reason === "multi_product_guard_unavailable" ? "Retrieval succeeded, but this context profile has no model connection. No model was called." : result.model.reason === "no_retrieved_context" ? "Model evaluation did not run because no context was retrieved. No model was called." : "Model evaluation did not run. No model was called."}</p> : result.model.status === "evaluated" ? <div><p className={styles.passage}>{result.model.answer || "No supported answer was found in the retrieved context."}</p><h4>Selected evidence</h4>{result.model.evidence.length === 0 ? <p>No evidence selected by the model.</p> : <ul className={styles.evidence}>{result.model.evidence.map(item => { const source = result.passages.find(passage => passage.rank === item.rank); return <li key={item.rank}><strong>Passage {item.rank}</strong><blockquote>{item.quote}</blockquote><p>Model relevance explanation: {item.reason}</p>{source && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}</li>; })}</ul>}</div> : <p>Unknown model status. Check the request before submitting again.</p>}
          <details className={styles.context}><summary>Retrieved context ({result.passages.length})</summary>{result.passages.length === 0 ? <p>No passages returned.</p> : <ol>{result.passages.map((passage, index) => <li key={`${passage.rank}-${index}`}><strong>Rank {passage.rank}: {passage.title}</strong>{(passage.productTitle || passage.productSku) && <p>Product: {[passage.productTitle, passage.productSku].filter(Boolean).join(" · ")}</p>}<p>{passage.sectionPath.join(" / ") || "Listing"} · captured {passage.capturedAt}</p><p>Query term overlap: {passage.lexicalOverlap.matched} of {passage.lexicalOverlap.total}. This heuristic does not establish relevance or correctness.</p><blockquote>{passage.text}</blockquote><a href={passage.sourceUrl} target="_blank" rel="noreferrer">Open source</a></li>)}</ol>}</details>
          {result.workflow && result.workflow.length > 0 && <details className={styles.context}><summary>Workflow stages</summary><ol>{result.workflow.map((step, index) => <li key={`${step.stage}-${index}`}><strong>{step.stage}</strong>: {step.status} · {metric(step.elapsedMs, " ms")}</li>)}</ol></details>}
          <details className={styles.context}><summary>Structured JSON</summary><p>Parsed playground response, including passages and available metrics.</p><pre className={styles.json}>{JSON.stringify(result, null, 2)}</pre><button className={styles.copy} type="button" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(result, null, 2)); setCopyStatus("Copied JSON."); } catch { setCopyStatus("Could not copy JSON. Select the text to copy it."); } }}>Copy JSON</button><span className={styles.copyStatus} role="status" aria-live="polite">{copyStatus}</span></details>
        </div>}
      </div>
    </div>
  </section>;
}
