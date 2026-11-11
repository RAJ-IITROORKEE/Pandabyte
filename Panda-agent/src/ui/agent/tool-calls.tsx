// Adapted from affectUI Tool Call Card (https://github.com/flohoeller/affectui), MIT License, Copyright (c) 2026 Florian Höller (adfects). Changes: PandaByte tokens, CSS module, no arguments/results panel.
"use client";

import { Check, ChevronDown, CircleAlert, FileText, LoaderCircle, Search, Wrench, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import styles from "./tool-calls.module.css";
import { toolGroupSummary, type ToolCall } from "./tool-summary";

export { toolGroupSummary, type ToolCall } from "./tool-summary";

function iconFor(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("search")) return Search;
  if (n.includes("doc") || n.includes("read")) return FileText;
  return Wrench;
}

function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolCallGroup({ calls, live }: { calls: ToolCall[]; live: boolean }) {
  const id = useId();
  // Follows `live` (open while running, collapsed after) until the user toggles it
  const [manual, setManual] = useState<boolean | null>(null);
  if (calls.length === 0) return null;

  const open = manual ?? live;
  const summary = toolGroupSummary(calls, live);
  const stack = calls.slice(-3);

  return (
    <div className={styles.group} data-open={open || undefined}>
      <button
        type="button"
        className={styles.head}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => setManual(!open)}
      >
        <span className={styles.stack} aria-hidden="true">
          {stack.map((c, i) => {
            const Icon = iconFor(c.name);
            return (
              <span className={styles.tile} key={`${c.id}-${i}`}>
                <Icon size={12} strokeWidth={1.5} />
              </span>
            );
          })}
        </span>
        <span className={styles.summary}>{summary}</span>
        <ChevronDown className={styles.chevron} size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>

      <ul className={styles.list} id={`${id}-list`} hidden={!open}>
        {calls.map((c) => {
          const Icon = iconFor(c.name);
          return (
            <li className={styles.row} key={c.id}>
              <Icon className={styles.icon} size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.name}>{c.name}</span>
              <span className={styles.label} title={c.label}>
                {c.label}
              </span>
              <Status call={c} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Status({ call }: { call: ToolCall }) {
  if (call.state === "running") {
    return (
      <span className={styles.status}>
        <LoaderCircle className={styles.spinner} size={14} strokeWidth={1.8} aria-hidden="true" />
        Working
      </span>
    );
  }
  if (call.state === "complete") {
    return (
      <span className={styles.status}>
        <Check size={14} strokeWidth={1.8} aria-hidden="true" />
        {call.durationMs != null ? formatSeconds(call.durationMs) : "Done"}
      </span>
    );
  }
  if (call.state === "failed") {
    return (
      <span className={styles.status}>
        <CircleAlert size={14} strokeWidth={1.8} aria-hidden="true" />
        Failed
      </span>
    );
  }
  return <span className={styles.status}>Outcome unknown</span>;
}
