import Link from "next/link";
import { Download, Eye } from "lucide-react";
import styles from "./invoice-template-actions.module.css";

export function InvoiceTemplateActions() {
  return <div className={styles.actions}>
    <Link className={styles.button} href="/account/invoice-sample"><Eye size={17} aria-hidden="true" />Preview invoice template</Link>
    <a className={styles.button} href="/templates/pandabyte-invoice-sample.pdf" download="PandaByte-sample-invoice.pdf" type="application/pdf"><Download size={17} aria-hidden="true" />Download sample PDF</a>
  </div>;
}
