"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { markdownUrl } from "./markdown-url";
import { ChartBlock } from "./chart-block";
import styles from "./workspace.module.css";

export function MarkdownText() {
  return <MarkdownTextPrimitive className={styles.markdown} smooth={false} defer componentsByLanguage={{ chart: { SyntaxHighlighter: ChartBlock } }} skipHtml remarkPlugins={[remarkGfm]} urlTransform={markdownUrl} components={{
    img: () => null,
    a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <>{children}</>,
  }} />;
}
