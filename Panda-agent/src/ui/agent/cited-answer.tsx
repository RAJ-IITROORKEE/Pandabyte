"use client";

import { Check, ChevronDown, Copy, ExternalLink } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { excerpt, sharedTitle, shortTitle, sourceLabels, visibleCards, type CitationView } from "./citation-view";
import styles from "./cited-answer.module.css";

type Ctx = { citations: CitationView[]; selected: string; seq: number; select: (id: string, scroll?: boolean) => void; setPanel: (el: HTMLDivElement | null) => void };
const CitationContext = createContext<Ctx | null>(null);

export function CitationProvider({ messageId, citations, children }: { messageId: string; citations: CitationView[]; children: ReactNode }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [seq, setSeq] = useState(0);
  const selected = citations.some(c => c.id === picked) ? picked! : citations[0]?.id ?? "";
  const select = (id: string, scroll = false) => {
    setPicked(id);
    if (scroll) setSeq(n => n + 1); // lets SourceAccordion react even when the id is unchanged
    if (scroll) requestAnimationFrame(() => panel?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  return <CitationContext.Provider key={messageId} value={{ citations, selected, seq, select, setPanel }}>{children}</CitationContext.Provider>;
}

export function SourceStrip() {
  const ctx = useContext(CitationContext);
  if (!ctx?.citations.length) return null;
  const { shown, more } = visibleCards(ctx.citations), labels = sourceLabels(ctx.citations), shared = sharedTitle(ctx.citations);
  return <>{shared && <p className={styles.sharedTitle}>{ctx.citations.length} excerpts from <strong>{shortTitle(shared, 90)}</strong></p>}<div className={styles.strip} role="group" aria-label="Sources">
    {shown.map(c => <button type="button" key={c.id} className={styles.card} aria-pressed={ctx.selected === c.id} onClick={() => ctx.select(c.id, true)}>
      <span className={styles.badge}>{c.n}</span><span className={styles.domain}>{c.domain}</span><span className={styles.cardTitle}>{shortTitle(labels.get(c.id)!.primary, 90)}</span>{labels.get(c.id)!.secondary && <span className={styles.cardSub}>{labels.get(c.id)!.secondary}</span>}
    </button>)}
    {more > 0 && <button type="button" className={`${styles.card} ${styles.more}`} aria-label={`${more} more sources`} onClick={() => ctx.select(ctx.citations[shown.length].id, true)}>+{more} more</button>}
  </div></>;
}

export function SourcePanel() {
  const ctx = useContext(CitationContext);
  const [feedback, setFeedback] = useState<{ id: string; text: string } | null>(null);
  const uid = useId();
  if (!ctx?.citations.length) return null;
  const { citations, selected, select } = ctx, labels = sourceLabels(citations);
  const current = citations.find(c => c.id === selected) ?? citations[0];
  const tabId = (id: string) => `${uid}-tab-${id}`;
  function onKey(e: KeyboardEvent) {
    const i = citations.findIndex(c => c.id === selected);
    const next = e.key === "ArrowRight" ? (i + 1) % citations.length : e.key === "ArrowLeft" ? (i - 1 + citations.length) % citations.length : e.key === "Home" ? 0 : e.key === "End" ? citations.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(citations[next].id);
    document.getElementById(tabId(citations[next].id))?.focus();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(current.quote); setFeedback({ id: current.id, text: "Copied" }); } catch { setFeedback({ id: current.id, text: "Could not copy" }); }
  }
  const fb = feedback?.id === current.id ? feedback.text : "";
  return <div className={styles.panelWrap} ref={el => ctx.setPanel(el)}>
    <div className={styles.tabs} role="tablist" aria-label="Sources" onKeyDown={onKey}>
      {citations.map(c => <button type="button" role="tab" key={c.id} id={tabId(c.id)} className={styles.tab} aria-selected={c.id === selected} aria-controls={`${uid}-panel`} tabIndex={c.id === selected ? 0 : -1} onClick={() => select(c.id)}>
        <span className={styles.badge}>{c.n}</span><span>{shortTitle(labels.get(c.id)!.primary, 28)}</span>
      </button>)}
    </div>
    <div className={styles.panel} role="tabpanel" id={`${uid}-panel`} aria-labelledby={tabId(current.id)}>
      <span className={styles.meta}>{current.domain}{current.date ? ` · ${current.date}` : ""}{current.kind ? ` · ${current.kind}` : ""}{current.section ? ` · ${current.section}` : ""}</span>
      <h3 className={styles.title}>{current.title}</h3>
      {current.quote && <blockquote className={styles.quote}>{current.quote}</blockquote>}
      <div className={styles.actions}>
        {current.href && <a className={styles.action} href={current.href} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={13} aria-hidden="true" /></a>}
        {current.quote && <button type="button" className={styles.action} onClick={copy}>{fb === "Copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />} Copy quote</button>}
        <span className={styles.feedback} role="status">{fb}</span>
      </div>
    </div>
  </div>;
}

export function SourceAccordion() {
  const ctx = useContext(CitationContext);
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<string | null>(null);
  const [seenSeq, setSeenSeq] = useState(0);
  const [feedback, setFeedback] = useState<{ id: string; text: string } | null>(null);
  const uid = useId();
  const listId = `${uid}-list`, rowId = (id: string) => `${uid}-row-${id}`;
  const seq = ctx?.seq ?? 0, selected = ctx?.selected;
  // A chip click bumps seq: open the list and the chosen row (adjusted during render, no effect round-trip).
  if (seq !== seenSeq) { setSeenSeq(seq); if (selected) { setOpen(true); setRow(selected); } }
  useEffect(() => {
    if (seq) document.getElementById(`${uid}-row-${selected}`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ctx?.citations.length) return null;
  const { citations } = ctx, labels = sourceLabels(citations), shared = sharedTitle(citations);
  const domains = [...new Set(citations.map(c => c.domain))].slice(0, 3);
  async function copy(c: CitationView) {
    try { await navigator.clipboard.writeText(c.quote); setFeedback({ id: c.id, text: "Copied" }); } catch { setFeedback({ id: c.id, text: "Could not copy" }); }
  }
  return <div className={styles.acc}>
    <button type="button" className={styles.accHead} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(o => !o)}>
      <span className={styles.stack} aria-hidden="true">{domains.map(d => <span key={d} className={styles.fav}>{d.replace(/^www\./, "").charAt(0).toUpperCase()}</span>)}</span>
      <span className={styles.accLabel}>{citations.length} {citations.length === 1 ? "source" : "sources"}</span>
      <ChevronDown size={14} aria-hidden="true" className={styles.chev} />
    </button>
    {open && <div id={listId} role="group" aria-label="Sources" className={styles.accList}>
      {shared && <p className={styles.accShared}>From {shortTitle(shared, 90)}</p>}
      {citations.map(c => {
        const l = labels.get(c.id)!, expanded = row === c.id, fb = feedback?.id === c.id ? feedback.text : "";
        return <div key={c.id} id={rowId(c.id)} className={styles.accRow}>
          <div className={styles.accLine}>
            <button type="button" className={styles.accMain} aria-expanded={expanded} aria-controls={`${rowId(c.id)}-q`} onClick={() => setRow(expanded ? null : c.id)}>
              <span className={styles.badge}>{c.n}</span>
              <span className={styles.accTitle}>{shortTitle(l.primary, 90)}</span>
              <span className={styles.accMeta}>{c.domain}{c.date ? ` · ${c.date}` : ""}</span>
            </button>
            {c.href && <a className={styles.accOpen} href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`Open source ${c.n}: ${c.domain}`}><ExternalLink size={13} aria-hidden="true" /></a>}
          </div>
          {expanded && <div id={`${rowId(c.id)}-q`} className={styles.accBody}>
            {c.quote && <p className={styles.accQuote}>{c.quote}</p>}
            {c.quote && <div className={styles.accActions}><button type="button" className={styles.accCopy} onClick={() => copy(c)}>Copy quote</button><span className={styles.feedback} role="status">{fb}</span></div>}
          </div>}
        </div>;
      })}
    </div>}
  </div>;
}

export function CitationChip({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(CitationContext);
  const previewId = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const c = ctx?.citations.find(x => x.id === id);
  if (!ctx || !c) return <span className={styles.chip}>{children}</span>;
  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(320, innerWidth * 0.9);
    const above = r.top > 140;
    setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)), top: above ? r.top - 8 : r.bottom + 8, above });
  }
  return <span className={styles.chipWrap}>
    <button type="button" ref={ref} className={styles.chip} aria-describedby={pos ? previewId : undefined} aria-label={`Source ${c.n}: ${c.title}`}
      onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={e => { if (e.currentTarget.matches(":focus-visible")) show(); }} onBlur={() => setPos(null)}
      onKeyDown={e => { if (e.key === "Escape") setPos(null); }} onClick={() => ctx.select(id, true)}>{c.n}</button>
    {pos && <span role="tooltip" id={previewId} className={styles.preview} style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}>
      <strong>{shortTitle(c.title, 80)}</strong><small>{c.domain}</small>{c.quote && <em>{excerpt(c.quote, 140)}</em>}
    </span>}
  </span>;
}
