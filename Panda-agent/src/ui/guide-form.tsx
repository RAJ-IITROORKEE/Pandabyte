"use client";

import { useState, type FormEvent } from "react";
import styles from "./guide-form.module.css";
import { prepareGuideInput, type GuideInput } from "./guide-input";

export type { GuideInput } from "./guide-input";
export type ProjectMemory = { version: number; guideTurns: number; compactions: number; intent: { goal: string; board: string; revision?: string; components: string[] }; questions: string[]; recentGoals: string[] };

export function GuideForm({ memory, disabled, onSubmit, onClose }: { memory: ProjectMemory | null; disabled: boolean; onSubmit: (input: GuideInput) => void; onClose: () => void }) {
  const [goal, setGoal] = useState(memory?.intent.goal ?? "");
  const [board, setBoard] = useState(memory?.intent.board ?? "");
  const [revision, setRevision] = useState(memory?.intent.revision ?? "");
  const [components, setComponents] = useState(memory?.intent.components.join("\n") ?? "");
  const [version] = useState(memory?.version ?? 0);
  const [error, setError] = useState("");
  const changed = (memory?.version ?? 0) !== version;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = prepareGuideInput(goal, board, revision, components, version);
    if (!input) { setError("Enter a goal and board, and use up to 8 components of 80 characters each. Remove invalid characters."); return; }
    setError("");
    onSubmit(input);
  }
  return <form className={styles.form} onSubmit={submit} aria-labelledby="guide-title">
    <div className={styles.heading}><div><h2 id="guide-title">Project guide</h2><p>Optional project details. Your board revision and components are user-reported, not verified hardware facts.</p></div><button type="button" disabled={disabled} onClick={onClose}>Close</button></div>
    <p>Project version {version}{memory ? ` · ${memory.guideTurns} guide turns · ${memory.compactions} memory updates` : " · new project"}</p>
    {memory && memory.questions.length > 0 && <div><strong>Open questions</strong><ul>{memory.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></div>}
    {memory && memory.recentGoals.length > 0 && <details><summary>Recent goals</summary><ul>{memory.recentGoals.map((recent, index) => <li key={index}>{recent}</li>)}</ul></details>}
    {changed && <p role="alert">This project changed on the server. Close and reopen the guide to review the latest version before saving.</p>}
    <label>Goal<textarea required maxLength={600} value={goal} onChange={event => setGoal(event.target.value)} disabled={disabled} /></label>
    <label>Board or model<input required maxLength={128} value={board} onChange={event => setBoard(event.target.value)} disabled={disabled} /></label>
    <label>Physical revision (optional, unverified)<input maxLength={80} value={revision} onChange={event => setRevision(event.target.value)} disabled={disabled} /></label>
    <label>Components (one per line)<textarea value={components} maxLength={647} onChange={event => setComponents(event.target.value)} disabled={disabled} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={disabled || changed}>Create project guide</button>
  </form>;
}
