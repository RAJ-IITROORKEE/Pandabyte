"use client";

import { useMemo, type ComponentProps } from "react";
import { Streamdown, defaultComponents, type CustomRendererProps } from "streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import "katex/dist/katex.min.css";
import remarkGfm from "remark-gfm";
import { citationLinks, type CitationOptions } from "./composer-helpers";
import { makeUrlTransform, rehypePlugins, STREAM_ANSWER_TOKENS } from "./streamdown-config";
import { ChartBlock } from "./chart-block";
import { MermaidBlock } from "./blocks/mermaid-block";
import { WiringBlock } from "./blocks/wiring-block";
import { FlowBlock } from "./blocks/flow-block";
import { StepsBlock } from "./blocks/steps-block";
import { CalloutBlock } from "./blocks/callout-block";
import { CitationChip } from "./agent/cited-answer";
import styles from "./rich-markdown.module.css";

const Pre = (props: ComponentProps<"pre">) => <pre {...props} />;
const Code = (props: ComponentProps<"code">) => <code {...props} />;
// Our strict-JSON / guarded renderers win over Streamdown's code block for these fences.
const renderers = [
  { language: "chart", component: ({ code }: CustomRendererProps) => <ChartBlock code={code} components={{ Pre, Code }} /> },
  { language: "mermaid", component: ({ code }: CustomRendererProps) => <MermaidBlock code={code} /> },
  { language: "wiring", component: ({ code }: CustomRendererProps) => <WiringBlock code={code} /> },
  { language: "flow", component: ({ code }: CustomRendererProps) => <FlowBlock code={code} /> },
  { language: "steps", component: ({ code }: CustomRendererProps) => <StepsBlock code={code} /> },
  { language: "callout", component: ({ code }: CustomRendererProps) => <CalloutBlock code={code} /> },
];
const plugins = { code, math, renderers };
const shikiTheme: ["github-light", "github-dark"] = ["github-light", "github-dark"];
const SafeLink = defaultComponents.a;

/** Renders model Markdown (untrusted) through Streamdown. `citations` maps [S1] markers to chips for one message. */
export function RichMarkdown({ text, citations }: { text: string; citations?: { messageId: string; ids: string[] } }) {
  const messageId = citations?.messageId, idKey = citations?.ids.join("|");
  const config = useMemo(() => {
    const prefix = messageId === undefined ? "" : `#source-${messageId}-`;
    const targets = new Map((idKey ? idKey.split("|") : []).map(id => [id, prefix + id]));
    return {
      // Streamdown caches its processor by plugin name plus JSON options, so the targets must be options, not a closure.
      remarkPlugins: messageId !== undefined ? [remarkGfm, [citationLinks, { prefix, ids: idKey ?? "" }] as [typeof citationLinks, CitationOptions]] : [remarkGfm],
      urlTransform: makeUrlTransform(targets),
      components: {
        img: () => null,
        // A link the URL policy removed (empty href) shows as plain text, as before the Streamdown move.
        a: (props: ComponentProps<"a">) => props.href?.startsWith("#source-") && prefix ? <CitationChip id={props.href.slice(prefix.length)}>{props.children}</CitationChip> : props.href ? <SafeLink {...props} rel="noopener noreferrer" /> : <>{props.children}</>,
      },
    };
  }, [messageId, idKey]);
  return <Streamdown className={styles.rich} mode={STREAM_ANSWER_TOKENS ? "streaming" : "static"} isAnimating={false} lineNumbers={false} skipHtml plugins={plugins} shikiTheme={shikiTheme} rehypePlugins={rehypePlugins} remarkPlugins={config.remarkPlugins} urlTransform={config.urlTransform} components={config.components as never} linkSafety={{ enabled: true }}>{text}</Streamdown>;
}
