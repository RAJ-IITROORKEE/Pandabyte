import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./catalog-presentation.module.css";

export function ProductOverview({ product, gallery, panel, children }: {
  product: Pick<PublishedRecord<"products">, "title" | "summary">;
  gallery: ReactNode;
  panel: ReactNode;
  children: ReactNode;
}) {
  return <main id="main" tabIndex={-1} className={styles.productPage}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <ol>
        <li><Link href="/">Home</Link></li>
        <li><ChevronRight aria-hidden="true" /><Link href="/shop">Shop</Link></li>
        <li aria-current="page"><ChevronRight aria-hidden="true" /><span>{product.title}</span></li>
      </ol>
    </nav>
    <div className={styles.productOverview}>
      <div className={styles.productMedia}>{gallery}</div>
      <div className={styles.productInformation}>
        <header className={styles.productHeading}>
          <h1>{product.title}</h1>
          {product.summary && <p>{product.summary}</p>}
        </header>
        {panel}
      </div>
    </div>
    {children}
  </main>;
}
