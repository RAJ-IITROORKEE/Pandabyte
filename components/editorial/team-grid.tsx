import Image from "next/image";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./editorial.module.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("");
}

export function TeamGrid({ items }: { items: PublishedRecord<"team">[] }) {
  if (!items.length) return null;
  return <ul className={styles.grid}>
    {items.map(({ id, document }) => <li className={styles.teamCard} key={id}>
      <span className={styles.avatar} aria-hidden="true">
        {document.mediaIds[0]
          ? <Image unoptimized src={`/api/media/${document.mediaIds[0]}`} alt="" width={64} height={64} />
          : initials(document.name)}
      </span>
      <div>
        <h3>{document.name}</h3>
        {document.role && <p>{document.role}</p>}
        {document.bio && <p>{document.bio}</p>}
        {document.links.length > 0 && <ul>
          {document.links.map((link, index) => <li key={`${link.url}-${index}`}><a className={styles.inlineLink} href={link.url} rel="noopener noreferrer">{link.label}</a></li>)}
        </ul>}
      </div>
    </li>)}
  </ul>;
}
