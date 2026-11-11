"use client";

import { useEffect, useId, useState } from "react";
import { CopyText } from "../ai-elements/code-block";
import { mermaidSourceAllowed } from "./block-specs";
import styles from "./blocks.module.css";

type State = { status: "loading" } | { status: "ready"; svg: string } | { status: "error" };

function readTheme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  const foreground = v("--foreground"), muted = v("--muted"), surface = v("--surface"), divider = v("--divider"), accent = v("--accent-ink"), background = v("--background");
  return {
    background: surface, primaryColor: surface, primaryTextColor: foreground, primaryBorderColor: accent,
    lineColor: muted, secondaryColor: background, tertiaryColor: background, textColor: foreground,
    nodeBorder: accent, clusterBkg: background, clusterBorder: divider, edgeLabelBackground: surface,
    noteBkgColor: surface, noteTextColor: foreground, actorBkg: surface, actorBorder: accent, actorTextColor: foreground,
    signalColor: muted, signalTextColor: foreground, fontFamily: "inherit", fontSize: "13px",
  };
}

export function MermaidBlock({ code }: { code: string }) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, "");
  const allowed = mermaidSourceAllowed(code);
  const [state, setState] = useState<State>({ status: "loading" });
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick(t => t + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const id = `mmd${uid}x${themeTick}`;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: readTheme() });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled) setState({ status: "ready", svg });
      } catch {
        document.getElementById(`d${id}`)?.remove(); // mermaid leaves an error node in <body> on failure
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, code, uid, themeTick]);

  if (!allowed || state.status === "error") return <figure className={styles.block}>
    <div className={styles.header}><span>Diagram</span><CopyText text={code} label="Copy source" /></div>
    <pre className={styles.plain}><code>{code}</code></pre>
    <p className={styles.note} role="status">Diagram could not be drawn</p>
  </figure>;

  return <figure className={styles.block}>
    <div className={styles.header}><span>Diagram</span><CopyText text={code} label="Copy source" /></div>
    {state.status === "loading"
      ? <div className={styles.skeleton} role="status" aria-label="Drawing diagram" />
      // Safe: SVG comes from mermaid with securityLevel "strict" (labels are sanitized).
      : <div className={styles.scroll} role="img" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />}
  </figure>;
}
