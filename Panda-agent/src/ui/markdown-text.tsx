"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { markdownUrl } from "./markdown-url";
import { ChartBlock } from "./chart-block";
import { MermaidBlock } from "./blocks/mermaid-block";
import { WiringBlock } from "./blocks/wiring-block";
import { StepsBlock } from "./blocks/steps-block";
import { CalloutBlock } from "./blocks/callout-block";
import { CodeHeader } from "./ai-elements/code-block";
import styles from "./workspace.module.css";

export function MarkdownText() {
  return <MarkdownTextPrimitive className={styles.markdown} smooth={false} defer componentsByLanguage={{ chart: { SyntaxHighlighter: ChartBlock }, mermaid: { SyntaxHighlighter: MermaidBlock }, wiring: { SyntaxHighlighter: WiringBlock }, steps: { SyntaxHighlighter: StepsBlock }, callout: { SyntaxHighlighter: CalloutBlock } }} skipHtml remarkPlugins={[remarkGfm]} urlTransform={markdownUrl} components={{
    CodeHeader,
    img: () => null,
    a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
  }} />;
}
