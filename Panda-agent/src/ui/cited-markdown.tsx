"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type { Root } from "mdast";
import { linkCitationMarkers } from "./composer-helpers";
import remarkGfm from "remark-gfm";
import { markdownUrl } from "./markdown-url";
import { ChartBlock } from "./chart-block";
import { MermaidBlock } from "./blocks/mermaid-block";
import { WiringBlock } from "./blocks/wiring-block";
import { FlowBlock } from "./blocks/flow-block";
import { StepsBlock } from "./blocks/steps-block";
import { CalloutBlock } from "./blocks/callout-block";
import { CodeHeader } from "./ai-elements/code-block";
import styles from "./workspace.module.css";
import { CitationChip } from "./agent/cited-answer";

export function CitedMarkdown({ messageId, citationIds }: { messageId: string; citationIds: string[] }) {
  const targets = new Map(citationIds.map(id => [id, `#source-${messageId}-${id}`]));
  function citations() {
    return (tree: Root) => linkCitationMarkers(tree, targets);
  }
  return <MarkdownTextPrimitive className={styles.markdown} smooth={false} defer componentsByLanguage={{ chart: { SyntaxHighlighter: ChartBlock }, mermaid: { SyntaxHighlighter: MermaidBlock }, wiring: { SyntaxHighlighter: WiringBlock }, flow: { SyntaxHighlighter: FlowBlock }, steps: { SyntaxHighlighter: StepsBlock }, callout: { SyntaxHighlighter: CalloutBlock } }} skipHtml remarkPlugins={[remarkGfm, citations]} urlTransform={(url, key) => targets.has(url.slice(url.lastIndexOf("-") + 1)) && [...targets.values()].includes(url) ? url : markdownUrl(url, key)} components={{
    CodeHeader,
    img: () => null,
    a: ({ href, children }) => href?.startsWith("#source-") ? <CitationChip id={href.slice(`#source-${messageId}-`.length)}>{children}</CitationChip> : href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
  }} />;
}
