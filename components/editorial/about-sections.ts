import type { ContentBlock } from "@/lib/admin/validation";

export function aboutSections(blocks: ContentBlock[]): ContentBlock[][] {
  const sections: ContentBlock[][] = [];
  for (const block of blocks) {
    if (!sections.length || (block.type === "heading" && block.level !== 3)) sections.push([]);
    sections[sections.length - 1].push(block);
  }
  return sections;
}
