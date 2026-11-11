"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { formatElapsed, panelSummary } from "./elapsed";
import styles from "./thinking-panel.module.css";
import { WorkingPill } from "./working-pill";

export type ThinkingSource = { id: string; title: string; domain: string };

export function ThinkingPanel({
  steps,
  busy,
  complete,
  startedAt,
  finishedAt,
  sources,
  note,
}: {
  steps: string[];
  busy: boolean;
  complete: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  sources?: ThinkingSource[];
  note?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [busy]);

  if (!busy && steps.length === 0) return null;

  const end = busy ? now : (finishedAt ?? now);
  const elapsedMs = startedAt === null ? 0 : end - startedAt;
  const showBody = busy || open;

  return (
    <div className={styles.panel}>
      {busy ? (
        <div className={styles.head}>
          <WorkingPill label={steps[steps.length - 1] ?? "Working"} />
          <span className={styles.timer} aria-hidden="true">
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.toggle} ${complete ? styles.done : ""}`}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          {complete ? <Check className={styles.check} size={14} aria-hidden="true" /> : null}
          <span>{panelSummary({ busy, complete, elapsedMs })}</span>
          <ChevronDown className={styles.chev} size={14} aria-hidden="true" />
        </button>
      )}
      {showBody ? (
        <div className={styles.body} id={bodyId}>
          <ol className={styles.steps}>
            {steps.map((label, i) => (
              <li key={`${i}-${label}`} className={styles.step}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={busy && i === steps.length - 1 ? styles.current : styles.past}>{label}</span>
              </li>
            ))}
          </ol>
          {note ? <p className={styles.note}>{note}</p> : null}
          {sources && sources.length > 0 ? (
            <div className={styles.sources}>
              <span className={styles.srcLabel}>
                Read {sources.length} {sources.length === 1 ? "source" : "sources"}
              </span>
              {sources.map((s) => (
                <span key={s.id} className={styles.chip} title={s.title}>
                  <span className={styles.chipTitle}>{s.title}</span>
                  <span className={styles.chipDomain}>{s.domain}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
