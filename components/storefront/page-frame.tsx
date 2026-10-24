import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-frame.module.css";

export function PublicPage({ eyebrow, title, description, children, wide = false }: {
  eyebrow?: string; title: string; description?: string; children?: ReactNode; wide?: boolean;
}) {
  return <main id="main" tabIndex={-1} className={`${styles.page} ${wide ? styles.wide : ""}`}>
    <div className={styles.heading}>
      {eyebrow && <p className="section-kicker">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
    {children}
  </main>;
}

export function EmptyState({ title, children, href, label }: { title: string; children?: ReactNode; href?: string; label?: string }) {
  return <section className={styles.empty}>
    <h2>{title}</h2>{children && <div>{children}</div>}
    {href && label && <Link className="site-link" href={href}>{label}</Link>}
  </section>;
}
