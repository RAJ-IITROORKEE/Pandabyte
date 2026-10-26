"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconX } from "@tabler/icons-react";
import { searchAdminNavigation } from "./admin-navigation";
import styles from "./admin-search.module.css";

export function AdminSearch({ capabilities, disableShortcut = false }: { capabilities: readonly string[]; disableShortcut?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchAdminNavigation(query, capabilities), [query, capabilities]);

  useEffect(() => {
    if (open) document.getElementById(`admin-search-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (disableShortcut) return;
      if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (dialogRef.current?.open) return;
      event.preventDefault();
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
    }
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [disableShortcut]);

  function close() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function select(href: string) {
    close();
    router.push(href);
  }

  return (
    <>
      <button className={styles.trigger} type="button" aria-label="Search admin pages" onClick={() => {
        setQuery("");
        setActiveIndex(0);
        setOpen(true);
      }}>
        <IconSearch aria-hidden="true" /><span>Search pages</span><kbd>Ctrl / ⌘ K</kbd>
      </button>
      <dialog ref={dialogRef} className={styles.dialog} aria-modal="true" aria-labelledby="admin-search-title"
        onClose={() => { setOpen(false); setQuery(""); setActiveIndex(0); }}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className={styles.panel}>
          <div className={styles.heading}>
            <h2 id="admin-search-title">Search admin pages</h2>
            <button type="button" aria-label="Close search" onClick={close}><IconX aria-hidden="true" /></button>
          </div>
          <div className={styles.searchRow}>
            <IconSearch aria-hidden="true" />
            <input ref={inputRef} className={styles.searchInput} type="search" role="combobox"
              aria-label="Search admin pages" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="true"
              aria-controls="admin-search-results" aria-activedescendant={results.length ? `admin-search-option-${activeIndex}` : undefined}
              placeholder="Search pages and sections" value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % results.length); }
                if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + results.length) % results.length); }
                if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); select(results[activeIndex].href); }
              }} />
          </div>
          <div className={styles.results} id="admin-search-results" role="listbox" aria-label="Admin pages">
            {results.length ? results.map((item, index) => {
              const Icon = item.icon;
              return (
                <button className={styles.option} type="button" role="option" id={`admin-search-option-${index}`}
                  aria-selected={activeIndex === index} data-active={activeIndex === index} key={item.href}
                  onMouseMove={() => setActiveIndex(index)} onClick={() => select(item.href)}>
                  <Icon aria-hidden="true" />
                  <span className={styles.optionText}>
                    <span>{item.label}</span>
                    <span className={styles.optionGroup}>{item.group}</span>
                  </span>
                  {item.comingSoon && <span className={styles.comingSoon}>Coming soon</span>}
                </button>
              );
            }) : <p className={styles.empty} role="status">No admin pages match “{query}”.</p>}
          </div>
        </div>
      </dialog>
    </>
  );
}
