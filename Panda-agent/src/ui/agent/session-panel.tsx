"use client";

import { BookOpen, Check, Circle, Cpu, ExternalLink, Globe, ListChecks, MessagesSquare, X } from "lucide-react";
import type { SessionSource } from "./overview-data";
import styles from "./session-panel.module.css";

/** Right-hand panel for the open chat: the latest run's steps, the sources its answers used, and what the chat used so far. */
export function SessionPanel({ steps, busy, complete, sources, questions, answers, model, onClose }: {
  steps: string[]; busy: boolean; complete: boolean; sources: SessionSource[]; questions: number; answers: number; model: string; onClose: () => void;
}) {
  const web = sources.filter(source => source.web), product = sources.filter(source => !source.web);
  return <aside className={styles.panel} aria-label="Chat details">
    <div className={styles.top}><strong>Chat details</strong><button type="button" className={styles.close} aria-label="Close chat details" onClick={onClose}><X size={15} /></button></div>
    <section aria-labelledby="session-progress">
      <h3 id="session-progress"><ListChecks size={14} aria-hidden="true" /> Progress</h3>
      {steps.length ? <ol className={styles.steps}>{steps.map((step, i) => {
        const current = busy && i === steps.length - 1, done = !current && (complete || i < steps.length - 1);
        return <li key={i} data-state={current ? "current" : done ? "done" : "stopped"}>{done ? <Check size={13} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}<span>{step}</span></li>;
      })}</ol> : <p className={styles.empty}>Steps for the next answer show here.</p>}
    </section>
    <section aria-labelledby="session-sources">
      <h3 id="session-sources"><BookOpen size={14} aria-hidden="true" /> Sources in this chat</h3>
      {sources.length ? <ul className={styles.sources}>{sources.slice(0, 8).map(source => <li key={source.key}>
        <span className={styles.tile} aria-hidden="true">{source.domain.replace(/^www\./, "").charAt(0).toUpperCase()}</span>
        <span className={styles.sourceText}><span>{source.title}</span><small>{source.domain}{source.uses > 1 ? ` · used ${source.uses}×` : ""}</small></span>
        {source.href && <a href={source.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.title}`}><ExternalLink size={13} /></a>}
      </li>)}{sources.length > 8 && <li className={styles.more}>+{sources.length - 8} more</li>}</ul> : <p className={styles.empty}>No sources yet. Product answers and web search add them here.</p>}
    </section>
    <section aria-labelledby="session-used">
      <h3 id="session-used">Used in this chat</h3>
      <dl className={styles.used}>
        <div><dt><MessagesSquare size={13} aria-hidden="true" /> Messages</dt><dd>{questions} asked · {answers} answered</dd></div>
        <div><dt><Globe size={13} aria-hidden="true" /> Web search</dt><dd>{web.length ? `${web.length} ${web.length === 1 ? "page" : "pages"}` : "Not used"}</dd></div>
        <div><dt><BookOpen size={13} aria-hidden="true" /> PandaByte sources</dt><dd>{product.length ? `${product.length} ${product.length === 1 ? "excerpt" : "excerpts"}` : "Not used"}</dd></div>
        <div><dt><Cpu size={13} aria-hidden="true" /> Model</dt><dd>{model}</dd></div>
      </dl>
    </section>
  </aside>;
}
