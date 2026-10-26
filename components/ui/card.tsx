// Adapted from Lightswind UI (MIT); source, hashes and notice: docs/ui-migrate-research/lightswind-card-adaptation.md.
import type { ComponentProps } from "react";
import styles from "./card.module.css";

export function Card({ as: Component = "div", className = "", ...props }: ComponentProps<"div"> & { as?: "div" | "section" }) {
  return <Component className={`${styles.card} ${className}`} {...props} />;
}

export function CardTitle({ as: Component = "h3", className = "", ...props }: ComponentProps<"h3"> & { as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" }) {
  return <Component className={`${styles.title} ${className}`} {...props} />;
}

export function CardDescription({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`${styles.description} ${className}`} {...props} />;
}
