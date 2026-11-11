// Pure Streamdown configuration (no JSX) so the safety rules can be unit-tested with node --test.
// Model output is untrusted: http(s) links only, no images, no raw HTML.
import { defaultRehypePlugins } from "streamdown";
import { markdownUrl } from "./markdown-url.ts";

/** Flip to true (with mode "streaming") when answers start arriving token by token. */
export const STREAM_ANSWER_TOKENS = false;

export const CUSTOM_FENCE_LANGUAGES = ["chart", "wiring", "steps", "callout", "flow"] as const;

/** Sanitize + harden only; rehype-raw is deliberately omitted so HTML is never parsed into live elements. */
const [hardenPlugin, hardenOptions] = defaultRehypePlugins.harden as unknown as [never, Record<string, unknown>];
export const rehypePlugins = [
  defaultRehypePlugins.sanitize,
  [hardenPlugin, { ...hardenOptions, allowedProtocols: ["http", "https"], allowDataImages: false }],
] as never;

/** Same URL policy as before the Streamdown move; citation anchors for this message are the only exception. */
export function makeUrlTransform(citationTargets: ReadonlyMap<string, string> = new Map()) {
  const allowed = new Set(citationTargets.values());
  return (url: string, key: string): string => (key === "href" && allowed.has(url) ? url : markdownUrl(url, key));
}
