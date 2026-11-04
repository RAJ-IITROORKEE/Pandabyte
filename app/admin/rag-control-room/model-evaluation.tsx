'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ModelCatalogItem } from '@/Panda-agent/src/control-room/model-catalog';
import { parseComparison, parseComparisonCapability, parseOperations, type ComparisonCapability, type ComparisonResponse, type Operation } from './comparison-state';
import styles from './model-evaluation.module.css';

const endpoint = '/api/admin/panda-agent/model-comparisons';
const pendingKey = 'panda-comparison-pending-operations';
const defaultModel = 'openai/gpt-4o-mini';
function rate(value:string) { const n=Number(value)*1_000_000; return n>0 && n<0.00000001 ? '<$0.00000001' : `$${n.toLocaleString('en-US',{maximumFractionDigits:8})}`; }
function measured(value:number|null|undefined, suffix='') { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value.toLocaleString()}${suffix}` : 'Unavailable'; }

export function ModelEvaluation() {
  const [models,setModels]=useState<ModelCatalogItem[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [query,setQuery]=useState('');
  const [catalogState,setCatalogState]=useState<'loading'|'ready'|'error'>('loading');
  const [catalogAttempt,setCatalogAttempt]=useState(0);
  const [capability,setCapability]=useState<ComparisonCapability|null>(null);
  const [capabilityError,setCapabilityError]=useState(false);
  const [capabilityAttempt,setCapabilityAttempt]=useState(0);
  const [guardReady,setGuardReady]=useState(false);
  const [locked,setLocked]=useState(false);
  const [pending,setPending]=useState<Operation[]>([]);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<ComparisonResponse|null>(null);
  const request=useRef<AbortController|null>(null);
  const initialized=useRef(false);

  useEffect(()=>{queueMicrotask(()=>{try{const raw=sessionStorage.getItem(pendingKey);if(raw){const parsed=parseOperations(JSON.parse(raw));if(parsed)setPending(parsed);setLocked(true);}}catch{setLocked(true);}setGuardReady(true);});},[]);
  useEffect(()=>()=>request.current?.abort(),[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/admin/panda-agent/models',{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();return response.json();})
      .then(data=>{if(controller.signal.aborted)return;if(!Array.isArray(data.models))throw Error();setModels(data.models);setCatalogState('ready');if(!initialized.current){initialized.current=true;if(data.models.some((model:ModelCatalogItem)=>model.id===defaultModel))setSelected([defaultModel]);}})
      .catch(()=>{if(!controller.signal.aborted)setCatalogState('error');});
    return()=>controller.abort();
  },[catalogAttempt]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const value=parseComparisonCapability(await response.json());if(!value)throw Error();if(!controller.signal.aborted){setCapability(value);setCapabilityError(false);}}).catch(()=>{if(!controller.signal.aborted)setCapabilityError(true);});
    return()=>controller.abort();
  },[capabilityAttempt]);

  const matching=useMemo(()=>{const term=query.trim().toLowerCase();return models.filter(model=>!term||model.name.toLowerCase().includes(term)||model.id.toLowerCase().includes(term));},[models,query]);
  const chosen=selected.map(id=>models.find(model=>model.id===id)).filter((model):model is ModelCatalogItem=>!!model);
  const configured=capability?.execution==='configured_unverified';
  const runnable=!!configured && selected.length>0 && selected.length<=4 && selected.every(model=>capability.models.includes(model));
  function toggle(id:string){if(busy)return;setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);setResult(null);setError('');}
  async function run(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||locked||!guardReady||!runnable||!question.trim())return;
    let operations:Operation[];
    try{operations=selected.map(model=>({model,requestId:crypto.randomUUID()}));sessionStorage.setItem(pendingKey,JSON.stringify(operations));}catch{setLocked(true);setError('Comparison safeguards are unavailable. Execution is disabled.');return;}
    setPending(operations);setResult(null);setError('');setBusy(true);
    const controller=new AbortController();request.current=controller;
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:question.trim(),operations}),signal:controller.signal});
      if(!response.ok){
        const failure=await response.json().catch(()=>null);
        if(controller.signal.aborted)return;
        if(response.status===503 && failure && typeof failure==='object' && Object.keys(failure).join(',')==='error' && failure.error && typeof failure.error==='object' && Object.keys(failure.error).join(',')==='code' && failure.error.code==='unconfigured'){sessionStorage.removeItem(pendingKey);setPending([]);setError('Comparison execution is not configured. No model was called.');}
        else{setLocked(true);setError('Comparison outcome could not be confirmed. Reconcile the pending operations before another run.');}
        return;
      }
      const parsed=parseComparison(await response.json(),operations);
      if(!parsed)throw Error();
      if(controller.signal.aborted)return;
      const unknown=operations.filter((_,index)=>parsed.results[index].status==='outcome_unknown');
      if(unknown.length){sessionStorage.setItem(pendingKey,JSON.stringify(unknown));setPending(unknown);setLocked(true);}else{sessionStorage.removeItem(pendingKey);setPending([]);}
      setResult(parsed);
    }catch{if(!controller.signal.aborted){setLocked(true);setError('Comparison outcome could not be confirmed. Reconcile the pending operations before another run.');}}
    finally{if(!controller.signal.aborted){request.current=null;setBusy(false);}}
  }

  return <section className={styles.panel} id="model-evaluation" aria-labelledby="model-evaluation-title">
    <div className={styles.heading}><div><h2 id="model-evaluation-title">Model evaluation</h2><p>Select models and compare answers against the same retrieved context.</p></div><span className={styles.badge}>{capabilityError?'Status unavailable':!capability?'Checking':configured?'Configured, unverified':'Not configured'}</span></div>
    <p className={styles.notice}>Catalog selection does not enable a model. Only configured models can run; comparison may incur usage charges.</p>
    <div className={styles.columns}>
      <div><div className={styles.subheading}><h3>Model catalog</h3>{catalogState==='ready'&&<span>{models.length} available</span>}</div>
        <label className={styles.search}>Search by model or provider<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search models" maxLength={200}/></label>
        {catalogState==='loading'&&<p role="status">Loading model catalog…</p>}
        {catalogState==='error'&&<div role="status"><p>Model catalog is unavailable. Check your access and try again.</p><button type="button" onClick={()=>{setCatalogState('loading');setCatalogAttempt(value=>value+1);}}>Try again</button></div>}
        {catalogState==='ready'&&<><p className={styles.hint}>{matching.length===0?'No matching models.':`Showing ${Math.min(matching.length,50)} of ${matching.length} matching models. Search to narrow the list.`}</p><ul className={styles.list}>{matching.slice(0,50).map(model=><li key={model.id}><div><strong>{model.name}</strong><span>{model.id}</span><span>{!capability?'Configuration unknown':capability.models.includes(model.id)?'Configured for comparison':'Not configured for comparison'}</span></div><button type="button" disabled={busy} aria-label={`${selected.includes(model.id)?'Remove':'Add'} ${model.name} ${selected.includes(model.id)?'from':'to'} comparison`} onClick={()=>toggle(model.id)}>{selected.includes(model.id)?'Remove':'Add'}</button></li>)}</ul></>}
      </div>
      <div><div className={styles.subheading}><h3>Comparison list</h3><span>{chosen.length} selected · up to 4 per run</span></div>
        {chosen.length===0?<div className={styles.empty}>Choose models from the catalog to compare context and published token rates.</div>:<ul className={styles.list}>{chosen.map(model=><li key={model.id}><div><strong>{model.name}</strong><span>{model.id}</span><p>Context: {model.context.toLocaleString('en-US')} tokens</p><p>Input: {rate(model.promptPerToken)} / 1M tokens · Output: {rate(model.completionPerToken)} / 1M tokens</p><p>{!capability?'Configuration unknown':capability.models.includes(model.id)?'Configured':'Not configured for execution'}</p></div><button type="button" disabled={busy} aria-label={`Remove ${model.name} from comparison`} onClick={()=>toggle(model.id)}>Remove</button></li>)}</ul>}
        <p className={styles.hint}>Catalog rates are estimates in USD per million tokens, not measured usage or total charges.</p>
        <p role="status">{capabilityError?'Comparison configuration could not be checked.':!capability?'Checking comparison configuration…':configured?'Guarded comparison profile configured; live connection is not verified.':'Comparison execution is not configured.'}</p>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={()=>{setCapability(null);setCapabilityError(false);setCapabilityAttempt(value=>value+1);}}>Refresh configuration</button><a href="#playground">Open playground</a></div>
        {locked&&<p className={styles.notice} role="status">A comparison outcome is pending or session storage is unavailable. Reconcile {pending.length?`${pending.length} pending model operation${pending.length===1?'':'s'}`:'the prior operation'} before another run. No automatic retry is made.</p>}
        <form className={styles.runner} onSubmit={run}><label>Product question<textarea value={question} onChange={event=>{setQuestion(event.target.value);setResult(null);setError('');}} maxLength={2000} required disabled={busy} placeholder="Include a product name, model or SKU"/></label>{selected.length>4&&<p>Select at most four models to run.</p>}{selected.some(model=>capability && !capability.models.includes(model))&&<p>Remove models that are not configured for execution before running.</p>}<button type="submit" disabled={busy||locked||!guardReady||!runnable||!question.trim()}>{busy?'Running comparison…':'Run comparison'}</button></form>
        {busy&&<p role="status">Retrieving shared context and evaluating configured models…</p>}{error&&<p role="alert">{error}</p>}
      </div>
    </div>
    {result&&<section className={styles.results} aria-labelledby="comparison-results-title"><h3 id="comparison-results-title">Comparison results</h3><p>All results use the same retrieved context. Answers and evidence require human review. Guard-accounted cost is not a provider invoice.</p><div className={styles.resultGrid}>{result.results.map(row=><article key={row.requestId} className={styles.result}><h4>{models.find(model=>model.id===row.model)?.name??row.model}</h4><p>Status: {row.status.replaceAll('_',' ')}</p>{row.status==='evaluated'&&<><p className={styles.answer}>{row.answer||'No supported answer was found in the retrieved context.'}</p><dl><div><dt>Elapsed</dt><dd>{measured(row.metrics?.elapsedMs,' ms')}</dd></div><div><dt>Input tokens</dt><dd>{measured(row.metrics?.inputTokens)}</dd></div><div><dt>Output tokens</dt><dd>{measured(row.metrics?.outputTokens)}</dd></div><div><dt>Guard-accounted cost (USD)</dt><dd>{row.metrics?.costUsd==null?'Unavailable':`$${row.metrics.costUsd.toLocaleString(undefined,{maximumFractionDigits:9})}`}</dd></div></dl><h5>Evidence</h5>{!row.evidence?.length?<p>No evidence selected.</p>:<ul>{row.evidence.map(item=>{const passage=result.context.passages[item.rank-1];return <li key={`${item.rank}-${item.quote}`}><strong>Passage {item.rank}: {passage.title}</strong><blockquote>{item.quote}</blockquote><p>{item.reason}</p><a href={passage.sourceUrl} target="_blank" rel="noreferrer">Open source</a></li>;})}</ul>}</>}</article>)}</div><details className={styles.context}><summary>Shared retrieved context ({result.context.passages.length})</summary><ol>{result.context.passages.map(passage=><li key={passage.rank}><strong>Passage {passage.rank}: {passage.title}</strong><p>{passage.sectionPath.join(' / ')||'Listing'} · captured {passage.capturedAt}</p><p className={styles.passage}>{passage.text}</p><a href={passage.sourceUrl} target="_blank" rel="noreferrer">Open source</a></li>)}</ol></details></section>}
  </section>;
}
