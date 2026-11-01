import type { ReactNode } from "react";
import styles from "./admin-stat-cards.module.css";

type StatItem = {
  label: string;
  value: string | number;
  description?: string;
  badge?: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
  icon?: ReactNode;
};

export function AdminStatCards({ items }: { items: StatItem[] }) {
  return <div className={styles.grid}>
    {items.map((item) => <article className={styles.card} key={item.label}>
      <div className={styles.heading}>
        <span>{item.label}</span>
        {(item.icon || item.badge) && <span className={`${styles.marker} ${styles[item.tone ?? "neutral"]}`}>
          {item.icon && <span aria-hidden="true" className={styles.icon}>{item.icon}</span>}{item.badge}
        </span>}
      </div>
      <strong className={styles.value}>{item.value}</strong>
      {item.description && <p className={styles.description}>{item.description}</p>}
    </article>)}
  </div>;
}
