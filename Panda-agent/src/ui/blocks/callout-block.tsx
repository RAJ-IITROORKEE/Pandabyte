import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { parseCalloutSpec } from "./block-specs";
import styles from "./blocks.module.css";

const ICONS = { info: Info, tip: Lightbulb, warning: TriangleAlert } as const;
const LABELS = { info: "Note", tip: "Tip", warning: "Warning" } as const;

export function CalloutBlock({ code }: { code: string }) {
  const spec = parseCalloutSpec(code);
  if (!spec) return <pre className={styles.plain}><code>{code}</code></pre>;
  const Icon = ICONS[spec.tone];
  return <aside className={`${styles.callout} ${styles[`tone_${spec.tone}`]}`} aria-label={LABELS[spec.tone]}>
    <Icon size={16} aria-hidden="true" />
    <div><strong>{spec.title ?? LABELS[spec.tone]}</strong><p>{spec.text}</p></div>
  </aside>;
}
