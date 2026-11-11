import { CopyText } from "../ai-elements/code-block";
import { parseStepsSpec } from "./block-specs";
import styles from "./blocks.module.css";

export function StepsBlock({ code }: { code: string }) {
  const spec = parseStepsSpec(code);
  if (!spec) return <figure className={styles.block}><pre className={styles.plain}><code>{code}</code></pre><p className={styles.note}>Steps could not be drawn</p></figure>;
  return <figure className={styles.block}>
    {spec.title && <figcaption className={styles.header}><span>{spec.title}</span></figcaption>}
    <ol className={styles.steps}>
      {spec.steps.map((step, i) => <li key={i} className={styles.step}>
        <span className={styles.stepNo} aria-hidden="true">{i + 1}</span>
        <div className={styles.stepBody}>
          <strong>{step.title}</strong>
          {step.detail && <p>{step.detail}</p>}
          {step.code && <div className={styles.stepCode}>
            <div className={styles.codeBar}><span>{step.lang ?? "Code"}</span><CopyText text={step.code} label="Copy" /></div>
            <pre className={styles.plain}><code>{step.code}</code></pre>
          </div>}
        </div>
      </li>)}
    </ol>
  </figure>;
}
