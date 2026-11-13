"use client";
import { useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import styles from "./reference-images.module.css";

type Source = { title: string; sourceUrl: string; images?: { url: string; description: string }[] };
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "source"; } };
type Shown = { url: string; description: string; title: string; sourceUrl: string; host: string };

/** Reference images (pinouts, diagrams, board photos) found on the web pages an answer cites. Loaded from the
 * original site without a referrer; a click opens a larger preview with the page it came from. */
export function ReferenceImages({ citations }: { citations: readonly Source[] }) {
  const shown: Shown[] = [];
  for (const c of citations) for (const image of c.images ?? []) {
    if (shown.length < 4 && !shown.some(s => s.url === image.url)) shown.push({ ...image, title: c.title, sourceUrl: c.sourceUrl, host: hostOf(c.sourceUrl) });
  }
  const [failed, setFailed] = useState<readonly string[]>([]);
  const [open, setOpen] = useState<Shown | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = shown.filter(s => !failed.includes(s.url));
  if (!visible.length) return null;
  const show = (item: Shown) => { setOpen(item); dialog.current?.showModal(); };
  return <section className={styles.strip} aria-label="Reference images from cited pages">
    <p className={styles.label}>Reference images</p>
    <ul className={styles.grid}>{visible.map(item => <li key={item.url}>
      <button type="button" className={styles.thumb} onClick={() => show(item)} aria-label={`Preview image from ${item.host}${item.description ? `: ${item.description}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party reference image, not optimisable */}
        <img src={item.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(previous => [...previous, item.url])} />
        <span>{item.host}</span>
      </button>
    </li>)}</ul>
    <dialog ref={dialog} className={styles.dialog} aria-label="Image preview" onClose={() => setOpen(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      {open && <figure>
        <button type="button" className={styles.close} aria-label="Close preview" onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element -- third-party reference image, not optimisable */}
        <img src={open.url} alt={open.description || `Image from ${open.host}`} referrerPolicy="no-referrer" />
        <figcaption>{open.description && <p>{open.description}</p>}<small>From {open.title} · {open.host}. Image belongs to its site; check the page before relying on it.</small>
          <span className={styles.links}><a href={open.sourceUrl} target="_blank" rel="noopener noreferrer">Open source page <ExternalLink size={13} aria-hidden="true" /></a><a href={open.url} target="_blank" rel="noopener noreferrer">Open image <ExternalLink size={13} aria-hidden="true" /></a></span>
        </figcaption>
      </figure>}
    </dialog>
  </section>;
}
