"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./product-tabs.module.css";

type Tab = { label: string; content: ReactNode };

export function ProductTabs({ tabs }: { tabs: Tab[] }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!tabs.length) return null;
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    refs.current[next]?.focus();
  }
  return <section className={styles.details} aria-label="Product details">
    <div className={styles.tabs} role="tablist" aria-label="Product information">
      {tabs.map((tab, index) => <button key={tab.label} ref={element => { refs.current[index] = element; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => move(event, index)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab, index) => <div key={tab.label} className={styles.panel} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}>{tab.content}</div>)}
  </section>;
}
