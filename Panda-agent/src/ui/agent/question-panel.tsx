'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, MessageCircleQuestion, Send } from 'lucide-react';
import { askedText, focusForKey, foldedText, optionForKey } from './question-keys';
import styles from './question-panel.module.css';

export type QuestionOption = { label: string; question: string; recommended: boolean };

type Props = {
  question: string;
  options: QuestionOption[];
  onChoose: (question: string) => void;
  onDismiss: () => void;
  /** Esc / "Later": fold the dock. Falls back to onDismiss. */
  onLater?: () => void;
  context?: string;
  disabled?: boolean;
  /** Set once answered; shows the answered state and announces it. */
  answeredLabel?: string;
  /** Play the fade-out (integrator removes the panel afterwards). */
  leaving?: boolean;
  /** Pulse the border once, used when the dock is brought back with Show. */
  pulse?: boolean;
};

export function QuestionPanel({ question, options, onChoose, onDismiss, onLater, context, disabled, answeredLabel, leaving, pulse }: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const ordered = [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)];
  const total = ordered.length + 1; // last row is "Something else…"
  const answered = answeredLabel !== undefined;
  const locked = !!disabled || answered;
  const typed = text.trim();
  const later = onLater ?? onDismiss;
  const send = () => { if (!locked && typed.length >= 1 && typed.length <= 500) onChoose(typed); };
  const focusRow = (i: number) => { setActive(i); rows.current[i]?.focus(); };
  const openOther = () => { setActive(ordered.length); setOpen(true); };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (event.target instanceof HTMLInputElement) return; // the input collapses itself
      event.preventDefault();
      later();
      return;
    }
    if (locked || event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
    const move = focusForKey(event.key, active, total);
    if (move !== null) { event.preventDefault(); focusRow(move); return; }
    const index = optionForKey(event.key, total);
    if (index === null) return;
    event.preventDefault();
    if (index === ordered.length) openOther();
    else onChoose(ordered[index].question);
  };

  const cls = [styles.panel, leaving && styles.leaving, pulse && styles.pulse].filter(Boolean).join(' ');
  return (
    <div className={cls} role="group" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.header}>
        <span className={styles.needs}><MessageCircleQuestion size={12} aria-hidden="true" />Needs you</span>
        {context ? <span className={styles.context}>{context}</span> : null}
        <button type="button" className={styles.later} onClick={later}>Later</button>
      </div>
      <p id={titleId} className={styles.question}>{question}</p>
      {answered ? (
        <p className={styles.answered}><Check size={14} aria-hidden="true" />Answered: {answeredLabel}</p>
      ) : (
        <div className={styles.options} role="listbox" aria-labelledby={titleId}>
          {ordered.map((option, i) => (
            <button
              key={option.question}
              ref={(el) => { rows.current[i] = el; }}
              type="button"
              role="option"
              aria-selected={active === i}
              tabIndex={active === i ? 0 : -1}
              className={styles.option}
              disabled={locked}
              aria-keyshortcuts={String(i + 1)}
              onFocus={() => setActive(i)}
              onClick={() => onChoose(option.question)}
            >
              <span className={styles.badge} aria-hidden="true">{i + 1}</span>
              <span className={styles.text}>
                <span className={styles.title}>{option.label}</span>
                {option.question !== option.label ? <span className={styles.summary}>{option.question}</span> : null}
              </span>
              {option.recommended ? <span className={styles.pill}>Recommended</span> : null}
            </button>
          ))}
          {open ? (
            <div className={styles.custom} role="option" aria-selected={active === ordered.length}>
              <input
                className={styles.input}
                value={text}
                maxLength={500}
                autoFocus
                disabled={locked}
                placeholder="Type your own answer"
                aria-label="Your own answer"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); send(); }
                  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
                }}
              />
              <button type="button" className={styles.send} disabled={locked || !typed} onClick={send} aria-label="Send answer"><Send size={14} aria-hidden="true" /></button>
            </div>
          ) : (
            <button
              ref={(el) => { rows.current[ordered.length] = el; }}
              type="button"
              role="option"
              aria-selected={active === ordered.length}
              tabIndex={active === ordered.length ? 0 : -1}
              className={`${styles.option} ${styles.other}`}
              disabled={locked}
              aria-keyshortcuts={String(total)}
              onFocus={() => setActive(ordered.length)}
              onClick={openOther}
            >
              <span className={styles.badge} aria-hidden="true">{total}</span>
              <span className={styles.title}>Something else…</span>
            </button>
          )}
        </div>
      )}
      <span className={styles.sr} role="status" aria-live="polite">{answered ? `Answered: ${answeredLabel}` : ''}</span>
    </div>
  );
}

/** One-line stand-in shown while the dock is folded. */
export function QuestionDockFolded({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <div className={styles.folded}>
      <span>{foldedText(count)} ·</span>
      <button type="button" className={styles.later} onClick={onShow}>Show</button>
    </div>
  );
}

/** Inline marker inside the message that asked the question. */
export function AskedLine({ question, state, onShow }: { question: string; state: 'waiting' | 'answered'; onShow: () => void }) {
  return <button type="button" className={styles.asked} onClick={onShow}>{askedText(question, state)}</button>;
}
