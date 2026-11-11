// Adapted from affectUI Thinking Loader (https://github.com/flohoeller/affectui), MIT License, Copyright (c) 2026 Florian Höller (adfects). Changes: PandaByte tokens, trimmed API.
"use client";

const RAYS = Array.from({ length: 8 }, (_, i) => i);

export function WorkingPill({ label, done = false, doneLabel }: { label: string; done?: boolean; doneLabel?: string }) {
  const text = done ? (doneLabel ?? label) : label;
  return (
    <span className="pb-wp" data-done={done || undefined} role="status" aria-live="polite">
      <style href="pb-working-pill" precedence="default">
        {css}
      </style>
      <span className="pb-wp__icon" aria-hidden="true">
        <svg className="pb-wp__spinner" viewBox="0 0 16 16">
          {RAYS.map((i) => (
            <line key={i} x1="8" y1="1.75" x2="8" y2="4.75" transform={`rotate(${i * 45} 8 8)`} style={{ animationDelay: `${(i - 8) * 100}ms` }} />
          ))}
        </svg>
        <svg className="pb-wp__check" viewBox="0 0 16 16">
          <path d="M3.5 8.4 6.6 11.3 12.5 4.9" />
        </svg>
      </span>
      <span className={done ? "pb-wp__label" : "pb-wp__label pb-wp__shine"} data-text={text} title={text}>
        {text}
      </span>
    </span>
  );
}

const css = /* css */ `
.pb-wp { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 20px; color: var(--muted); font-size: 13px; font-weight: 500; line-height: 20px; }
.pb-wp__icon { position: relative; flex: none; width: 16px; height: 16px; }
.pb-wp__icon svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transition: opacity 240ms ease; }
.pb-wp__spinner line { stroke: var(--accent-ink); stroke-width: 1.2; stroke-linecap: round; opacity: 0.2; animation: pb-wp-ray 800ms linear infinite; }
.pb-wp__check { opacity: 0; fill: none; stroke: var(--accent-ink); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.pb-wp[data-done] .pb-wp__spinner { opacity: 0; }
.pb-wp[data-done] .pb-wp__check { opacity: 1; }
.pb-wp[data-done] .pb-wp__label { color: var(--foreground); }
.pb-wp__label { position: relative; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-wp__shine::after { content: attr(data-text); position: absolute; inset: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: transparent; background: linear-gradient(90deg, transparent 38%, var(--foreground) 50%, transparent 62%) 100% 0 / 300% 100% no-repeat; -webkit-background-clip: text; background-clip: text; animation: pb-wp-sweep 1.6s linear infinite; pointer-events: none; }
@keyframes pb-wp-ray { 0% { opacity: 1; } 100% { opacity: 0.2; } }
@keyframes pb-wp-sweep { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) {
  .pb-wp__spinner line { animation: none; opacity: 0.6; }
  .pb-wp__shine::after { display: none; }
}
`;
