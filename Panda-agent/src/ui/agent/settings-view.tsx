"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Lock, Palette, Sparkles, Trash2, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./settings-view.module.css";

// Reviewed facts for each hosted model (12 Nov 2026); prices are OpenRouter USD per million input / output tokens.
const modelFacts: Record<string, { summary: string; speed: string; provider: string; price: string }> = {
  "anthropic/claude-haiku-5.5": { summary: "Balanced default. Strong at code, diagrams and step-by-step guides.", speed: "Fast", provider: "Google Vertex", price: "$0.10 / $0.50" },
  "openai/gpt-6-luna": { summary: "Careful, well-structured answers and charts.", speed: "Fast", provider: "Azure US", price: "$0.11 / $0.55" },
  "deepseek/deepseek-v4-flash": { summary: "Quick and low cost; good flowcharts and explanations.", speed: "Fastest", provider: "Wafer", price: "$0.12 / $0.17" },
  "qwen/qwen3.8-27b": { summary: "Open-weight model with detailed setup instructions.", speed: "Slower", provider: "DeepInfra", price: "$0.15 / $1.88" },
  "openai/gpt-oss-20b": { summary: "Open-weight and very fast; shorter answers.", speed: "Very fast", provider: "Groq", price: "$0.075 / $0.30" },
};

const sections = [
  { id: "settings-models", label: "Models", icon: Sparkles },
  { id: "settings-preferences", label: "Preferences", icon: Palette },
  { id: "settings-data", label: "Data & privacy", icon: Lock },
  { id: "settings-account", label: "Account", icon: UserRound },
] as const;

export function SettingsView({ titleRef, models, defaultModel, onDefaultModel, saved, onDeleteAll, onClose, deleteDisabled }: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  models: { id: string; label: string }[];
  defaultModel: string;
  onDefaultModel: (id: string) => void;
  saved: boolean;
  onDeleteAll: () => void;
  onClose: () => void;
  deleteDisabled: boolean;
}) {
  return <div className={styles.page}>
    <div className={styles.top}><button type="button" className={styles.back} onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /> Back to chat</button></div>
    <h1 id="settings-title" ref={titleRef} tabIndex={-1}>Agent settings</h1>
    <p className={styles.lead}>Choices here are saved in this browser for your account.{saved ? "" : " This browser is blocking storage, so they last until you reload."}</p>
    <div className={styles.layout}>
      <nav className={styles.nav} aria-label="Settings sections">{sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`}><Icon size={15} aria-hidden="true" />{label}</a>)}</nav>
      <div className={styles.content}>
        <section id="settings-models" className={styles.card} aria-labelledby="settings-models-title">
          <h2 id="settings-models-title"><Sparkles size={15} aria-hidden="true" /> Default model</h2>
          <p className={styles.help}>Every new chat starts with this model. You can still switch per message in the composer.</p>
          <div className={styles.models} role="radiogroup" aria-label="Default model">{models.map(model => {
            const facts = modelFacts[model.id], checked = model.id === defaultModel;
            return <button key={model.id} type="button" role="radio" aria-checked={checked} className={styles.model} onClick={() => onDefaultModel(model.id)}>
              <span className={styles.radio} aria-hidden="true">{checked && <Check size={12} />}</span>
              <span className={styles.modelText}><strong>{model.label}</strong>{facts && <span>{facts.summary}</span>}{facts && <span className={styles.meta}>{facts.speed} · {facts.provider} · {facts.price} per M tokens</span>}</span>
            </button>;
          })}</div>
          <p className={styles.note}><Lock size={13} aria-hidden="true" /> Every model runs on a provider endpoint that keeps no copy of your prompts and does not train on them. Models that cannot meet this, including all Gemini and free models, are not offered.</p>
        </section>
        <section id="settings-preferences" className={styles.card} aria-labelledby="settings-preferences-title">
          <h2 id="settings-preferences-title"><Palette size={15} aria-hidden="true" /> Preferences</h2>
          <div className={styles.row}><span><strong>Appearance</strong><span>Light or dark theme for the whole site.</span></span><ThemeToggle /></div>
        </section>
        <section id="settings-data" className={styles.card} aria-labelledby="settings-data-title">
          <h2 id="settings-data-title"><Lock size={15} aria-hidden="true" /> Data &amp; privacy</h2>
          <p className={styles.help}>Your chats are stored in your PandaByte account and only you can read them. Product answers quote approved PandaByte listings; web answers cite the pages they used.</p>
          <div className={styles.row}><span><strong>Delete all chats</strong><span>Removes every saved chat, including archived chats. This cannot be undone.</span></span>
            <button type="button" className={styles.danger} disabled={deleteDisabled} onClick={onDeleteAll}><Trash2 size={14} aria-hidden="true" /> Delete all</button></div>
        </section>
        <section id="settings-account" className={styles.card} aria-labelledby="settings-account-title">
          <h2 id="settings-account-title"><UserRound size={15} aria-hidden="true" /> Account</h2>
          <div className={styles.links}><Link href="/account">Account overview</Link><Link href="/account/settings">Profile, sign-in and security</Link></div>
        </section>
      </div>
    </div>
  </div>;
}
