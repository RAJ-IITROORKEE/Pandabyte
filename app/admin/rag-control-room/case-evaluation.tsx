'use client';

import { useEffect, useRef, useState } from 'react';
import type { EvaluationMode } from '@/Panda-agent/src/control-room/evaluation-runner';
import styles from './model-evaluation.module.css';

import { parseRun, type State } from './case-evaluation-state';
const endpoint = '/api/admin/panda-agent/evaluations';
const pendingKey = 'panda-rag-evaluation-run';


export function CaseEvaluation() {
 const [state, setState] = useState<State | null>(null);
 const [mode, setMode] = useState<EvaluationMode>('retrieval');
 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('Loading evaluation status…');
 const active = useRef<AbortController | null>(null);

 async function refresh(signal?: AbortSignal) {
  try {
  const id = sessionStorage.getItem(pendingKey);
  const response = await fetch(endpoint + (id ? '?requestId=' + encodeURIComponent(id) : ''), { cache: 'no-store', signal });
  if (!response.ok) throw Error('Status unavailable');
  const data = await response.json();
  const run = data.run === null ? null : parseRun(data.run);
  if (!/^[a-f0-9]{64}$/.test(data.corpusFingerprint) || data.caseSet?.count !== 20 || (data.run !== null && !run)) throw Error('Status unavailable');
  if (!signal?.aborted) { setState({ ...data, run }); setNotice(''); if (run) setMode(run.mode); }
  } catch (error) { if (!signal?.aborted) setState(null); throw error; }
 }
 useEffect(() => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => void refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setNotice('Evaluation status could not be loaded. Refresh to check again.'); }), 0);
  return () => { window.clearTimeout(timer); controller.abort(); active.current?.abort(); };
 }, []);

 async function run() {
  if (!state || busy || (state.run?.claimedIndex != null && mode === 'model')) return;
  const controller = new AbortController(); active.current = controller;
  setBusy(true); setNotice('');
  try {
   const previous = state.run;
   const canResume = previous && previous.claimedIndex === null && previous.results.length < 20 && previous.mode === mode && previous.corpusFingerprint === state.corpusFingerprint
    && previous.results.every(r => ['passed', 'failed'].includes(r.status));
   const requestId = canResume ? previous.requestId : crypto.randomUUID();
   sessionStorage.setItem(pendingKey, requestId);
   if (!canResume) setState(s => s ? { ...s, run: { requestId, mode, corpusFingerprint: s.corpusFingerprint, results: [], claimedIndex: null } } : s);
   for (let index = canResume ? previous.results.length : 0; index < 20; index++) {
    controller.signal.throwIfAborted();
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ requestId, caseIndex: index, mode, corpusFingerprint: state.corpusFingerprint }), signal: controller.signal });
    if (!response.ok) { setState(null); throw Error('Evaluation stopped. Refresh the saved status before continuing.'); }
    const data = await response.json(); const saved = parseRun(data.run);
    if (!saved || saved.requestId !== requestId || saved.mode !== mode || saved.corpusFingerprint !== state.corpusFingerprint || data.corpusFingerprint !== state.corpusFingerprint) { setState(null); throw Error('Evaluation outcome could not be confirmed. Refresh saved status.'); }
    setState(s => s ? { ...s, run: saved } : s);
    if (saved.claimedIndex !== null || saved.results.length !== index + 1) throw Error('A case has an unconfirmed outcome. Check its saved status before continuing.');
    if (['unavailable', 'outcome_unknown'].includes(saved.results[index].status)) { setNotice('Evaluation paused. The saved case requires review before another model run.'); return; }
   }
   setNotice('All 20 cases completed. Review failures and model evidence checks below.');
  } catch (error) { if (!controller.signal.aborted) { setState(null); setNotice(error instanceof Error ? error.message : 'Evaluation unavailable. Refresh saved status before continuing.'); } }
  finally { if (!controller.signal.aborted) { active.current = null; setBusy(false); } }
 }

 const results = state?.run?.results ?? [];
 return <section className={styles.panel} aria-labelledby="case-evaluation-title">
  <h2 id="case-evaluation-title">20-case RAG evaluation</h2>
  <p>Run the reviewed source-visible engineering cases against the current product corpus. Model mode uses the shared prototype allowance and configured provider.</p>
  <label>Evaluation mode<select value={mode} disabled={busy} onChange={e => setMode(e.target.value as EvaluationMode)}>
   <option value="retrieval">Retrieval and evidence</option><option value="model">Real model answers and evidence</option>
  </select></label>
  <div className={styles.actions}>
   <button type="button" disabled={!state || busy || (state.run?.claimedIndex != null && mode === 'model')} onClick={() => void run()}>{busy ? `Running case ${Math.min(results.length + 1, 20)} of 20…` : mode === 'model' ? 'Start 20 cases with model usage' : 'Run 20 retrieval cases'}</button>
   <button type="button" disabled={busy} onClick={() => void refresh().catch(() => setNotice('Evaluation status unavailable.'))}>Refresh saved status</button>
  </div>
  {notice && <p role="status">{notice}</p>}
  {state?.run?.claimedIndex != null && <p role="alert">Case {state.run.claimedIndex + 1} is pending or has an uncertain outcome. Its request will not be dispatched again. Select retrieval mode to start a separate run.</p>}
  {mode === 'model' && state?.run && <p>Starting a new model run incurs usage for every case again. Saved completed cases resume only when their corpus and mode match.</p>}
  <p>{results.length} of 20 saved · {results.filter(r => r.status === 'passed').length} passed · {results.filter(r => r.status === 'failed').length} failed</p>
  {results.length > 0 && <div style={{ overflowX: 'auto' }}><table><thead><tr><th scope="col">Case</th><th scope="col">Result</th><th scope="col">Retrieval workflow</th><th scope="col">Case execution</th><th scope="col">Model</th></tr></thead>
   <tbody>{results.map(r => <tr key={r.caseId}><th scope="row">{r.caseId}</th><td>{r.status}{r.failureReason && <span> · {r.failureReason}</span>}</td><td>{r.retrievalMs ?? '—'} ms</td><td>{r.elapsedMs ?? '—'} ms</td><td>{r.modelStatus}</td></tr>)}</tbody></table></div>}
  {results.map(r => <details key={r.caseId}><summary>{r.caseId} question and model evidence</summary><p>{r.caseQuestion}</p><p>{r.modelAnswer ?? 'No model answer was requested or released.'}</p>
   {r.modelEvidence.map(e => <blockquote key={e.rank}><p>{e.quote}</p><p>Passage {e.rank} · {e.reason}</p></blockquote>)}{r.reviewTruncated && <p>This saved review excerpt was truncated.</p>}</details>)}
  {results.some(r => r.manualReviewRequired) && <p>Automatic model checks verify expected values and literal source support. Full semantic answer review is still required.</p>}
 </section>;
}
