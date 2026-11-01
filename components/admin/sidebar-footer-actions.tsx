"use client";

import { Ellipsis, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./sidebar-footer-actions.module.css";

export function SidebarFooterActions() {
  const id = useId();
  const trigger = useRef<HTMLElement>(null);
  const root = useRef<HTMLDetailsElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, bottom: 64 });

  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(12, Math.min(rect.right - 220, window.innerWidth - 232)), bottom: window.innerHeight - rect.top + 8 });
  }

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return <details ref={root} className={styles.root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }} onKeyDownCapture={(event) => {
    if (event.key === "Escape" && root.current?.open) {
      event.preventDefault(); event.stopPropagation(); root.current.open = false; trigger.current?.focus();
    }
  }} onToggle={(event) => { setOpen(event.currentTarget.open); if (event.currentTarget.open) link.current?.focus(); }}>
    <summary ref={trigger} className={styles.trigger} role="button" tabIndex={0} aria-label="Sidebar account options"
      aria-expanded={open} aria-controls={id} onClick={place}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault(); place(); if (root.current) root.current.open = true; link.current?.focus();
        }
      }}><Ellipsis size={19} aria-hidden="true" /></summary>
    <nav id={id} className={styles.panel} style={position} aria-label="Sidebar shortcuts">
      <Link ref={link} href="/" className={styles.item} onClick={() => { if (root.current) root.current.open = false; }}>
        <ExternalLink size={16} aria-hidden="true" /><span>Open storefront</span>
      </Link>
    </nav>
  </details>;
}
