"use client";

import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./admin-notice.module.css";

type AdminNoticeProps = Omit<ComponentPropsWithRef<"div">, "role"> & {
  tone: "success" | "error";
  onDismiss?: () => void;
  actions?: ReactNode;
};

export function AdminNotice({ children, tone, onDismiss, actions, className, ...props }: AdminNoticeProps) {
  // Hiding feedback must not clear a failed-load or conflict guard in its caller.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return actions ? <div className={styles.dismissedActions}>{actions}</div> : null;
  return <div {...props} className={`${styles.notice} ${styles[tone]} ${className ?? ""}`} role={tone === "error" ? "alert" : "status"}>
    <div className={styles.content}>{children}{actions}</div>
    <button className={styles.close} type="button" aria-label={`Dismiss ${tone === "error" ? "error" : "success"} notification`} onClick={() => { setDismissed(true); onDismiss?.(); }}><X size={18} aria-hidden="true" /></button>
  </div>;
}
