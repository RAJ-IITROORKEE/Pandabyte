import Image from "next/image";
import { Globe } from "lucide-react";
import { IconBrandLinkedin } from "@tabler/icons-react";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./team-grid.module.css";

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase() ?? "").join("");
}

export function TeamGrid({ items }: { items: PublishedRecord<"team">[] }) {
  if (!items.length) return null;
  return <ul className={styles.grid}>
    {items.map(({ id, document }) => <li className={styles.card} key={id}>
      <span className={styles.avatar} aria-hidden="true">
        {document.mediaIds[0]
          ? <Image unoptimized src={`/api/media/${encodeURIComponent(document.mediaIds[0])}`} alt="" width={160} height={160} />
          : initials(document.name)}
      </span>
      <h3>{document.name}</h3>
      {document.role && <p className={styles.role}>{document.role}</p>}
      {document.bio && <p className={styles.bio}>{document.bio}</p>}
      {document.links.length > 0 && <ul className={styles.links}>
        {document.links.map((link, index) => <li key={`${link.url}-${index}`}><a href={link.url} rel="noopener noreferrer" aria-label={`${document.name}: ${link.label}`}>
          {link.url.toLowerCase().includes("linkedin.com") ? <IconBrandLinkedin size={18} aria-hidden="true" /> : <Globe size={18} aria-hidden="true" />}
          <span>{link.label}</span>
        </a></li>)}
      </ul>}
    </li>)}
  </ul>;
}
