"use client";

import { useRef, useState } from "react";
import styles from "./playground.module.css";

const modes = ["allow", "deny"] as const;
type Mode = typeof modes[number];
type Status = "running" | "completed" | "error" | "unverified" | "already_started";

export function PlaygroundToolFixture() {
  const [results, setResults] = useState<Partial<Record<Mode, Status>>>({});
  const pending = useRef(false);
  const started = useRef(new Set<Mode>());

  async function run(mode: Mode) {
    if (pending.current || started.current.has(mode)) return;
    pending.current = true;
    started.current.add(mode);
    setResults(current => ({ ...current, [mode]: "running" }));
    let status: Status = "unverified";
    try {
      const response = await fetch(`/api/admin/panda-agent/playground/tool-fixture?case=${mode}`, {
        method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(130_000),
      });
      if (response.ok) {
        const value = await response.json();
        if (mode === "allow" && value?.toolStatus === "completed" && value.toolCalls === 1) status = "completed";
        if (mode === "deny" && value?.toolStatus === "error" && value.toolCalls === 0) status = "error";
      } else if (response.status === 409) {
        status = "already_started";
      }
    } catch {
      // A lost response can leave the one-shot check running. Preserve the spent case.
    } finally {
      setResults(current => ({ ...current, [mode]: status }));
      pending.current = false;
    }
  }

  return <section className={styles.toolFixture} aria-labelledby="tool-fixture-heading">
    <h3 id="tool-fixture-heading">Local tool permission check</h3>
    <p>Two disposable OpenCode sessions use a scripted local model and a read-only fixture tool. Each case runs once.</p>
    {modes.map(mode => <div className={styles.toolFixtureCase} key={mode}>
      <button className={styles.copy} type="button" aria-disabled={results[mode] !== undefined || Object.values(results).includes("running")} onClick={() => void run(mode)}>
        {mode === "allow" ? "Run allowed tool" : "Run denied tool"}
      </button>
      <p role="status">
        {results[mode] === "running" && "Checking native tool dispatch…"}
        {results[mode] === "completed" && "Tool completed. Returned pandabyte_fixture_tool_result. 1 MCP invocation."}
        {results[mode] === "error" && "Tool error. OpenCode denied permission. 0 MCP invocations."}
        {results[mode] === "unverified" && "Tool check could not be verified. The case may have started."}
        {results[mode] === "already_started" && "This case is already started or the fixture is busy."}
      </p>
    </div>)}
  </section>;
}
