"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import styles from "./catalog-filters.module.css";

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const desktopSnapshot = () => false;

export function CatalogFilters({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, desktopSnapshot);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => { if (desktop.matches && dialog.current?.open) dialog.current.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return <aside className={styles.sidebar} aria-label="Catalog filters">
    <button className={styles.open} type="button" onClick={() => dialog.current?.showModal()}>
      <SlidersHorizontal aria-hidden="true" /> Filters
    </button>
    <dialog ref={dialog} className={styles.drawer} role={mobile ? "dialog" : "group"} aria-labelledby="catalog-filters-title">
      <div className={styles.heading}>
        <h2 id="catalog-filters-title">Filters</h2>
        <button className={styles.close} type="button" onClick={() => dialog.current?.close()} aria-label="Close filters"><X aria-hidden="true" /></button>
      </div>
      {children}
    </dialog>
  </aside>;
}
