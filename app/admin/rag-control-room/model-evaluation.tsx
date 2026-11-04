'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ModelCatalogItem } from '@/Panda-agent/src/control-room/model-catalog';
import styles from './model-evaluation.module.css';

function rate(value: string) {
  const perMillion = Number(value) * 1_000_000;
  if (perMillion > 0 && perMillion < 0.00000001) return '<$0.00000001';
  return `$${perMillion.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

export function ModelEvaluation() {
  const [models, setModels] = useState<ModelCatalogItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/panda-agent/models', { cache:'no-store', signal:controller.signal })
      .then(async response => { if (!response.ok) throw Error(); return response.json(); })
      .then(data => { if (!controller.signal.aborted && Array.isArray(data.models)) { setModels(data.models); setState('ready'); } else if (!controller.signal.aborted) setState('error'); })
      .catch(() => { if (!controller.signal.aborted) setState('error'); });
    return () => controller.abort();
  }, [attempt]);
  const matching = useMemo(() => { const term=query.trim().toLowerCase(); return models.filter(model => !term || model.name.toLowerCase().includes(term) || model.id.toLowerCase().includes(term)); }, [models,query]);
  const chosen = models.filter(model => selected.includes(model.id));
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current,id]);
  return <section className={styles.panel} id="model-evaluation" aria-labelledby="model-evaluation-title">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Compare</p><h2 id="model-evaluation-title">Model evaluation</h2><p>Build a comparison list from OpenRouter’s public model catalog.</p></div><span className={styles.badge}>Preparation only</span></div>
    <p className={styles.notice}>Selections are kept only on this page. No comparison runs or model calls are made. The existing playground supports only its approved GPT-4o-mini cases, subject to its execution guard.</p>
    <div className={styles.columns}>
      <div><div className={styles.subheading}><h3>Model catalog</h3>{state === 'ready' && <span>{models.length} available</span>}</div>
        <label className={styles.search}>Search by model or provider<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search models" maxLength={200} /></label>
        {state === 'loading' && <p role="status">Loading model catalog…</p>}
        {state === 'error' && <div role="status"><p>Model catalog is unavailable. Check your access and try again.</p><button type="button" onClick={() => { setState('loading'); setAttempt(value => value + 1); }}>Try again</button></div>}
        {state === 'ready' && <><p className={styles.hint}>{matching.length === 0 ? 'No matching models.' : `Showing ${Math.min(matching.length,50)} of ${matching.length} matching models. Search to narrow the list.`}</p><ul className={styles.list}>{matching.slice(0,50).map(model => <li key={model.id}><div><strong>{model.name}</strong><span>{model.id}</span></div><button type="button" aria-label={`${selected.includes(model.id) ? 'Remove' : 'Add'} ${model.name} ${selected.includes(model.id) ? 'from' : 'to'} comparison`} onClick={() => toggle(model.id)}>{selected.includes(model.id) ? 'Remove' : 'Add'}</button></li>)}</ul></>}
      </div>
      <div><div className={styles.subheading}><h3>Comparison list</h3><span>{chosen.length} selected</span></div>
        {chosen.length === 0 ? <div className={styles.empty}>Choose models from the catalog to compare context and published token rates.</div> : <ul className={styles.list}>{chosen.map(model => <li key={model.id}><div><strong>{model.name}</strong><span>{model.id}</span><p>Context: {model.context.toLocaleString('en-US')} tokens</p><p>Input: {rate(model.promptPerToken)} / 1M tokens · Output: {rate(model.completionPerToken)} / 1M tokens</p></div><button type="button" aria-label={`Remove ${model.name} from comparison`} onClick={() => toggle(model.id)}>Remove</button></li>)}</ul>}
        <p className={styles.hint}>Rates are catalog estimates in USD per million tokens; provider routes and prices can change. They do not represent measured results or total charges.</p>
        <div className={styles.actions}><button type="button" disabled>Run comparison</button><a href="#playground">Open approved playground</a></div>
      </div>
    </div>
  </section>;
}
