"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./about-page.module.css";

export function AboutMetrics({ products, categories, people }: { products: number; categories: number; people: number }) {
  const section = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const node = section.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!node || motion.matches || typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    let started: number | undefined;
    const animate = (now: number) => {
      started ??= now;
      const elapsed = Math.min((now - started) / 1400, 1);
      setProgress(1 - (1 - elapsed) ** 3);
      if (elapsed < 1) frame = window.requestAnimationFrame(animate);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      setProgress(0);
      frame = window.requestAnimationFrame(animate);
    }, { threshold: 0.25 });
    const stopForReducedMotion = () => {
      if (!motion.matches) return;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      setProgress(1);
    };
    observer.observe(node);
    motion.addEventListener("change", stopForReducedMotion);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      motion.removeEventListener("change", stopForReducedMotion);
    };
  }, []);

  return <section ref={section} className={styles.metrics} aria-label="PandaByte in numbers">
    {[
      { value: products, label: "Products in the catalog" },
      { value: categories, label: "Hardware categories" },
      { value: people, label: "People behind PandaByte" },
    ].map(({ value, label }) => <div key={label}>
      <strong>
        <span className={styles.metricAccessible}>{value}+</span>
        <span className={styles.metricValue} aria-hidden="true">{Math.round(value * progress)}+</span>
      </strong>
      <span>{label}</span>
    </div>)}
  </section>;
}
