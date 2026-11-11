"use client";

import { useMessagePartText } from "@assistant-ui/react";
import { RichMarkdown } from "./rich-markdown";

export function CitedMarkdown({ messageId, citationIds }: { messageId: string; citationIds: string[] }) {
  return <RichMarkdown text={useMessagePartText().text} citations={{ messageId, ids: citationIds }} />;
}
