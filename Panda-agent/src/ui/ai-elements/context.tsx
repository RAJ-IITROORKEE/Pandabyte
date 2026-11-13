"use client";

// Adapted from Vercel AI Elements (Context); Apache-2.0 notice in Panda-agent/third-party/ai-elements.
import { useId, useState } from "react";
import { formatTokens } from "../../hosted-model";
import { contextPercent, formatUsd, meterTone, ringDash } from "./context-math";
import styles from "./context.module.css";

export interface ContextMeterProps {
  usedTokens: number;
  maxTokens?: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  costNanoUsd?: number;
  steps?: number;
  label?: string;
}

const RADIUS = 5;

// Display-only, but a focusable <button> lets keyboard users reach the details, and aria-describedby ties it to the card.
export function ContextMeter({ usedTokens, maxTokens, inputTokens, outputTokens, cachedTokens, costNanoUsd, steps, label = "Context window" }: ContextMeterProps) {
  const cardId = useId();
  const [dismissed, setDismissed] = useState(false);
  const percent = contextPercent(usedTokens, maxTokens);
  const { circumference, offset } = ringDash(percent ?? 0, RADIUS);
  const used = formatTokens(usedTokens);
  const text = maxTokens ? `${used} / ${formatTokens(maxTokens)}` : used;
  return <span className={styles.root} data-dismissed={dismissed ? "" : undefined} onMouseLeave={() => setDismissed(false)} onBlur={() => setDismissed(false)}>
    <button type="button" className={`${styles.trigger} ${styles[meterTone(percent ?? 0)]}`} aria-describedby={cardId} aria-label={`${label}: ${text}${percent === null ? "" : `, ${percent}% used`}`} onKeyDown={event => { if (event.key === "Escape") setDismissed(true); }}>
      {text}
      {percent === null ? null : <svg className={styles.ring} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx="7" cy="7" r={RADIUS} fill="none" strokeWidth="2" />
        <circle className={styles.bar} cx="7" cy="7" r={RADIUS} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
      </svg>}
    </button>
    <span id={cardId} role="tooltip" className={styles.card}>
      <p className={styles.heading}>{label}</p>
      <p className={styles.summary}>{used}{maxTokens ? ` of ${formatTokens(maxTokens)}` : ""}{percent === null ? "" : ` (${percent}%)`}</p>
      <dl className={styles.rows}>
        <div className={styles.row}><dt>Input</dt><dd>{formatTokens(inputTokens)}</dd></div>
        <div className={styles.row}><dt>Output</dt><dd>{formatTokens(outputTokens)}</dd></div>
        {cachedTokens === undefined ? null : <div className={styles.row}><dt>Cached input</dt><dd>{formatTokens(cachedTokens)}</dd></div>}
        {steps === undefined ? null : <div className={styles.row}><dt>Agent steps</dt><dd>{steps}</dd></div>}
        {costNanoUsd === undefined ? null : <div className={styles.row}><dt>Est. cost</dt><dd>{formatUsd(costNanoUsd)}</dd></div>}
      </dl>
      <p className={styles.note}>Context = the largest single prompt this turn; billed tokens add up every step.</p>
    </span>
  </span>;
}
