"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type { Root } from "mdast";
import { linkCitationMarkers } from "./composer-helpers";
import remarkGfm from "remark-gfm";
import { markdownUrl } from "./markdown-url";
import styles from "./workspace.module.css";

export function CitedMarkdown({ messageId, citationIds }: { messageId: string; citationIds: string[] }) {
  const targets = new Map(citationIds.map(id => [id, `#source-${messageId}-${id}`]));
  function citations() {
    return (tree: Root) => linkCitationMarkers(tree, targets);
  }
  return <MarkdownTextPrimitive className={styles.markdown} smooth={false} defer skipHtml remarkPlugins={[remarkGfm, citations]} urlTransform={(url, key) => targets.has(url.slice(url.lastIndexOf("-") + 1)) && [...targets.values()].includes(url) ? url : markdownUrl(url, key)} components={{
    img: () => null,
    a: ({ href, children }) => href?.startsWith("#source-") ? <a href={href} onClick={() => { const source = document.getElementById(href.slice(1)); if (source instanceof HTMLDetailsElement) source.open = true; }}>{children}</a> : href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
  }} />;
}
