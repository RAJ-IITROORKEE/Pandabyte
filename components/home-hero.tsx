"use client";

import { useRef, type ReactNode } from "react";
import styles from "./home.module.css";

export function HomeHero({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  return <section
    ref={section}
    className={styles.hero}
    aria-labelledby="home-title"
    onPointerMove={(event) => {
      if (event.pointerType !== "mouse" || !section.current) return;
      const bounds = section.current.getBoundingClientRect();
      section.current.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
      section.current.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
    }}
    onPointerLeave={() => {
      section.current?.style.removeProperty("--pointer-x");
      section.current?.style.removeProperty("--pointer-y");
    }}
  >{children}</section>;
}
