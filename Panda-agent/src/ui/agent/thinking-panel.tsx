"use client";

import { BookOpen, Check, ChevronDown, Circle, Cpu, Globe, Hammer, Layers, ListChecks, ListFilter, Package, Plug, Search, ShieldCheck, Sparkles, Wrench, X, type LucideIcon } from "lucide-react";
import type { PlanStep } from "../../agent-loop/plan";
import type { ToolStep } from "../../agent-loop/turn-events";
import { useEffect, useId, useState } from "react";
import { formatElapsed, panelSummary, stepDurations } from "./elapsed";
import { stepKind, type StepKind } from "./step-icons";
import styles from "./thinking-panel.module.css";

export type ThinkingSource = { id: string; title: string; domain: string };

const ICONS: Record<StepKind, LucideIcon> = {
  understand: Sparkles,
  search_web: Globe,
  read: BookOpen,
  select: ListFilter,
  check: ShieldCheck,
  save: Check,
  product: Package,
  other: Circle,
};

const TOOL_ICONS: Record<string, LucideIcon> = { search_catalog: Search, read_product: BookOpen, find_pinout: Cpu, web_search: Globe, load_skill: Sparkles, open_mcp_server: Plug, compile_sketch: Hammer };
const toolIcon = (name: string) => TOOL_ICONS[name] ?? (name.startsWith("mcp_") ? Plug : Wrench);
const STATE_WORD = { running: "running", done: "done", error: "failed" } as const;

const MAX_CHIPS = 4;

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function SourceChip({ source }: { source: ThinkingSource }) {
  const name = source.domain || source.title;
  // Deterministic tint from the domain; only --status-soft / --accent-ink mixes.
  const tint = 12 + (hash(name) % 5) * 10;
  return (
    <span className={styles.chip} title={source.title}>
      <span
        className={styles.tile}
        aria-hidden="true"
        style={{ background: `color-mix(in srgb, var(--accent-ink) ${tint}%, var(--status-soft))` }}
      >
        {(name.replace(/^www\./i, "")[0] ?? "?").toUpperCase()}
      </span>
      <span className={styles.chipTitle}>{source.title || source.domain}</span>
    </span>
  );
}

export function ThinkingPanel({
  steps,
  busy,
  complete,
  startedAt,
  finishedAt,
  sources,
  note,
  stepTimes,
  webSearch,
  plan,
  toolSteps,
}: {
  steps: string[];
  busy: boolean;
  complete: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  sources?: ThinkingSource[];
  note?: string;
  /** Epoch ms at which each step arrived (same order as `steps`). */
  stepTimes?: number[];
  /** Label the sources row "Searched the web" instead of "Read N sources". */
  webSearch?: boolean;
  /** The agent's checklist for a multi-step request (latest update), ticked off live. */
  plan?: PlanStep[];
  /** Tool calls of this turn (search, read, compile...), upserted by id as they start and finish. */
  toolSteps?: ToolStep[];
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
  const durations = busy ? [] : stepDurations(stepTimes, finishedAt);
  const shown = sources?.slice(0, MAX_CHIPS) ?? [];
  const more = (sources?.length ?? 0) - shown.length;
  const SrcIcon = webSearch ? Globe : BookOpen;
  const toolCount = toolSteps?.length ?? 0;
  const planDone = plan?.filter((s) => s.done).length ?? 0;
  const srcLabel = busy
    ? "Searching"
    : webSearch
      ? "Searched the web"
      : `Read ${sources?.length ?? 0} ${sources?.length === 1 ? "source" : "sources"}`;

  return (
    <div className={styles.panel} role="status">
      {busy ? (
        <div className={styles.head}>
          <span className={styles.live} aria-hidden="true">{panelSummary({ busy, complete, elapsedMs })}</span>
          <span className={styles.sr}>{steps[steps.length - 1] ?? "Working"}</span>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.toggle} ${complete ? styles.done : ""}`}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          {complete ? <Layers className={styles.check} size={14} aria-hidden="true" /> : null}
          <span>{panelSummary({ busy, complete, elapsedMs })}</span>
          {toolCount ? <span className={styles.planCount}>{toolCount} {toolCount === 1 ? "tool" : "tools"}</span> : null}
          {plan?.length ? <span className={styles.planCount}>{planDone}/{plan.length} planned steps</span> : null}
          <ChevronDown className={styles.chev} size={14} aria-hidden="true" />
        </button>
      )}
      {showBody ? (
        <div className={styles.body} id={bodyId}>
          {plan?.length ? (
            <div className={styles.plan}>
              <span className={styles.srcLabel}>
                <ListChecks size={14} aria-hidden="true" />
                Plan {planDone}/{plan.length}
              </span>
              <ul className={styles.planList}>
                {plan.map((s, i) => (
                  <li key={`${i}-${s.text}`} className={styles.planItem}>
                    <span className={s.done ? styles.boxDone : styles.box} aria-hidden="true">
                      {s.done ? <Check size={10} strokeWidth={3} /> : null}
                    </span>
                    <span className={s.done ? styles.planDone : styles.planTodo}>{s.text}</span>
                    <span className={styles.sr}>{s.done ? " (done)" : " (to do)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {toolCount ? (
            <div className={styles.plan}>
              <span className={styles.srcLabel}>
                <Wrench size={14} aria-hidden="true" />
                Tools
              </span>
              <ul className={styles.planList}>
                {toolSteps!.map((t) => {
                  const Icon = toolIcon(t.name);
                  return (
                    <li key={t.id} className={styles.toolRow}>
                      <Icon className={styles.icon} size={14} aria-hidden="true" />
                      <span className={t.state === "running" ? styles.toolNow : t.state === "error" ? styles.toolError : styles.past}>{t.label}</span>
                      <span className={styles.toolState} aria-hidden="true">
                        {t.state === "running" ? <span className={styles.spin} /> : t.state === "done" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} className={styles.errorMark} />}
                      </span>
                      {t.ms != null && t.state !== "running" ? <span className={styles.dur}>{formatElapsed(t.ms)}</span> : null}
                      <span className={styles.sr}> ({STATE_WORD[t.state]})</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <ol className={styles.steps}>
            {steps.map((label, i) => {
              const current = busy && i === steps.length - 1;
              const Icon = ICONS[stepKind(label)];
              const ms = durations[i];
              return (
                <li key={`${i}-${label}`} className={styles.step}>
                  <Icon className={current ? styles.iconNow : styles.icon} size={14} aria-hidden="true" />
                  <span className={current ? styles.current : styles.past}>{label}</span>
                  {ms != null ? <span className={styles.dur}>{formatElapsed(ms)}</span> : null}
                </li>
              );
            })}
            {complete && !busy ? (
              <li className={styles.step}>
                <span className={styles.finishedIcon} aria-hidden="true">
                  <Check size={10} strokeWidth={3} />
                </span>
                <span className={styles.finished}>Finished thinking</span>
              </li>
            ) : null}
          </ol>
          {note ? <p className={styles.note}>{note}</p> : null}
          {sources && sources.length > 0 ? (
            <div className={styles.sources}>
              <span className={styles.srcLabel}>
                <SrcIcon size={14} aria-hidden="true" />
                {srcLabel}
              </span>
              <div className={styles.chips}>
                {shown.map((s) => (
                  <SourceChip key={s.id} source={s} />
                ))}
                {more > 0 ? <span className={styles.more}>+{more} more</span> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
