import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import styles from "./hover-border-gradient.module.css";

// Adapted from Aceternity UI Hover Border Gradient: https://ui.aceternity.com/registry/hover-border-gradient.json
export function HoverBorderGradient({ href, children }: { href: ComponentProps<typeof Link>["href"]; children: ReactNode }) {
  return (
    <Link className={styles.link} href={href}>
      <span className={styles.gradient} aria-hidden="true" />
      <span className={styles.content}>{children}</span>
    </Link>
  );
}
