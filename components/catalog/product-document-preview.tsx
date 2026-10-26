"use client";

import { useEffect, useState } from "react";
import styles from "./product-document-preview.module.css";

// Word output stays in a scriptless sandbox, never in the application's DOM.
function isolatedDocument(body: HTMLElement, sheet: HTMLElement) {
  const allowed = new Set(["DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "P", "SPAN", "A", "BR", "HR", "B", "STRONG", "I", "EM", "U", "S", "SUP", "SUB", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "COLGROUP", "COL", "UL", "OL", "LI", "IMG", "SVG", "TITLE"]);
  for (const element of [...body.querySelectorAll("*")]) {
    if (!allowed.has(element.tagName) || element.tagName === "SVG") { element.remove(); continue; }
    for (const attr of [...element.attributes]) {
      if (!["class", "style", "id", "colspan", "rowspan", "width", "height", "alt", "src"].includes(attr.name) || (attr.name === "src" && !/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(attr.value))) element.removeAttribute(attr.name);
    }
    if (element.tagName === "IMG" && !element.hasAttribute("src")) element.remove();
  }
  const css = [...sheet.querySelectorAll("style")].map(style => (style.textContent ?? "").replace(/<\/style/gi, "<\\/style")).join("\n");
  // A sandbox without allow-same-origin has an opaque origin and cannot access Clerk or parent data.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; script-src 'none'; font-src 'none'; connect-src 'none'"><style>${css}\nhtml,body{margin:0;background:#e5e5e5;color:#171717} .docx-wrapper{padding:16px!important;min-width:max-content} article.docx{box-shadow:none!important} img{max-width:100%}</style></head><body>${body.innerHTML}</body></html>`;
}

export function ProductDocumentPreview({ mediaId }: { mediaId: string }) {
  const [open, setOpen] = useState(false), [html, setHtml] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/media/${mediaId}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) throw new Error("document");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("document");
        const { renderAsync } = await import("docx-preview");
        if (!active) return;
        const body = document.createElement("div"), sheet = document.createElement("div");
        await renderAsync(bytes, body, sheet, { useBase64URL: true, renderAltChunks: false, ignoreFonts: true, experimental: false, renderComments: false, renderChanges: false });
        if (active) { setHtml(isolatedDocument(body, sheet)); setError(""); }
      } catch { if (active && !controller.signal.aborted) setError("The document preview is unavailable. You can download the original Word file."); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [open, mediaId]);

  return <div className={styles.document}>
    <div className={styles.actions}><button type="button" aria-expanded={open} onClick={() => { setHtml(""); setError(""); setOpen(value => !value); }}>{open ? "Close document preview" : "Preview document"}</button><a href={`/api/media/${mediaId}`} download>Download Word file</a></div>
    <p className={styles.note}>Word document · Layout preview supports text, tables and embedded images. Some Word features may differ; the original file preserves the complete document.</p>
    {open && (error ? <p role="alert">{error}</p> : html ? <iframe className={styles.frame} srcDoc={html} sandbox="" referrerPolicy="no-referrer" title="Product Word document preview" /> : <p role="status">Preparing document preview…</p>)}
  </div>;
}
