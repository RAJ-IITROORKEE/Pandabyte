import type { Root, PhrasingContent } from "mdast";

export function validateLocalFiles(currentCount: number, incoming: readonly Pick<File, "size" | "type">[]): boolean {
  return currentCount + incoming.length <= 3 && incoming.every(file => file.size <= 5 * 1024 * 1024 && /^(image\/(png|jpeg|webp)|text\/plain)$/.test(file.type));
}

export function linkCitationMarkers(tree: Root, targets: ReadonlyMap<string, string>) {
  function walk(node: { type: string; children?: unknown[] }) {
    if (!node.children || node.type === "link" || node.type === "linkReference") return;
    node.children = node.children.flatMap(child => {
      const item = child as { type: string; value?: string; children?: unknown[] };
      if (item.type !== "text" || !item.value) { walk(item); return [child]; }
      return item.value.split(/(\[S\d+\])/g).filter(Boolean).map(part => {
        const target = targets.get(part.slice(1, -1));
        return target ? { type: "link", url: target, children: [{ type: "text", value: part }] } : { type: "text", value: part };
      }) as PhrasingContent[];
    });
  }
  walk(tree);
}

/** Remark plugin form of linkCitationMarkers. Streamdown caches its processor by plugin name plus JSON options, so the targets must be options. */
export type CitationOptions = { prefix: string; ids: string };
export function citationLinks({ prefix, ids }: CitationOptions) {
  const targets = new Map(ids.split("|").filter(Boolean).map(id => [id, prefix + id]));
  return (tree: Root) => linkCitationMarkers(tree, targets);
}
