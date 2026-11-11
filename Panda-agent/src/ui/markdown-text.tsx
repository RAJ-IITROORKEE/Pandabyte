"use client";

import { useMessagePartText } from "@assistant-ui/react";
import { RichMarkdown } from "./rich-markdown";

export function MarkdownText() {
  return <RichMarkdown text={useMessagePartText().text} />;
}
