"use client";

import { useEffect, useState } from "react";
import styles from "./policy.module.css";

export function PolicyToc({ headings }: { headings: { id: string; text: string }[] }) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const update = () => {
      const current = headings.map(({ id }) => document.getElementById(id)).filter((element): element is HTMLElement => element !== null);
      const visible = current.filter((element) => element.getBoundingClientRect().top <= 140);
      setActive(visible.at(-1)?.id ?? current[0]?.id ?? "");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [headings]);
  const items = <ul>{headings.map(({ id, text }) => <li key={id}><a href={`#${id}`} aria-current={active === id ? "location" : undefined} onClick={(event) => {
    const details = event.currentTarget.closest("details");
    if (details) {
      window.setTimeout(() => {
        details.open = false;
        document.getElementById(id)?.focus({ preventScroll: true });
      }, 0);
    }
  }}>{text}</a></li>)}</ul>;
  return <><nav className={styles.desktopToc} aria-label="On this page"><h2>On this page</h2>{items}</nav><details className={styles.mobileToc}><summary>On this page</summary><nav aria-label="On this page">{items}</nav></details></>;
}
