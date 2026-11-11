"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { CodeHeaderProps } from "@assistant-ui/react-markdown";
import styles from "./code-block.module.css";

export function CopyText({ text, label = "Copy" }: { text: string; label?: string }) {
  const [result, setResult] = useState<{ text: string; status: "success" | "failure" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const status = result?.text === text ? result.status : null;
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setResult({ text, status: "success" });
    } catch {
      setResult({ text, status: "failure" });
    }
    timer.current = setTimeout(() => setResult(null), 3000);
  }
  return <span className={styles.copyWrap}><button className={styles.copy} type="button" onClick={() => void copy()}>{status === "success" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {label}</button><span className={styles.feedback} role="status">{status === "success" ? "Copied" : status === "failure" ? "Could not copy. Try again." : ""}</span></span>;
}

export function CodeHeader({ language, code }: CodeHeaderProps) {
  if (language && ["chart", "mermaid", "wiring", "flow", "steps", "callout"].includes(language)) return null; // designed blocks render themselves, not as code
  return <div className={styles.header}><span>{language && language !== "unknown" ? language : "Code"}</span><CopyText text={code} label="Copy code" /></div>;
}
