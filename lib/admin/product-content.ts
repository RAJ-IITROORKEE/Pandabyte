import type { ContentBlock } from "./validation.ts";

export type RichMark = { type: string; attrs?: Record<string, string> };
export type RichNode = { type: string; attrs?: Record<string, string | number | number[] | null>; text?: string; marks?: RichMark[]; content?: RichNode[] };
export type ProductRichContent = RichNode & { type: "doc"; content: RichNode[] };
export const PRODUCT_TEXT_COLORS = ["#111827", "#374151", "#6b7280", "#b91c1c", "#c2410c", "#a16207", "#15803d", "#0369a1", "#1d4ed8", "#7e22ce"];
export const PRODUCT_HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8"];
export const PRODUCT_FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "32px"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
export function productContentHref(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /[^\x21-\x7e]|\\/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  const match = /^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/.exec(value);
  return !!match && (match[1] === undefined || Number(match[1]) <= 65535);
}

// This closed schema is shared by draft validation, the editor and the React renderer.
export function parseProductRichContent(value: unknown): ProductRichContent | null {
  let count = 0, characters = 0, images = 0;
  const walk = (node: unknown, parent: string, depth: number, lists: number): node is RichNode => {
    if (!object(node) || !keys(node, ["type", "attrs", "content", "text", "marks"]) || typeof node.type !== "string" || ++count > 2000 || depth > 12) return false;
    const type = node.type;
    const allowedChildren: Record<string, string[]> = {
      root: ["doc"], doc: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock", "horizontalRule", "table", "image"],
      paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"], codeBlock: ["text"],
      bulletList: ["listItem"], orderedList: ["listItem"], listItem: ["paragraph", "bulletList", "orderedList", "blockquote", "codeBlock"],
      blockquote: ["paragraph", "heading", "bulletList", "orderedList"], table: ["tableRow"], tableRow: ["tableHeader", "tableCell"],
      tableHeader: ["paragraph", "bulletList", "orderedList"], tableCell: ["paragraph", "bulletList", "orderedList"],
    };
    if (!allowedChildren[parent]?.includes(type)) return false;
    const attrs = node.attrs ?? {};
    if (!object(attrs)) return false;
    const attrKeys: Record<string, string[]> = { paragraph: ["textAlign"], heading: ["level", "textAlign"], orderedList: ["start"], codeBlock: ["language"], image: ["mediaId", "alt", "caption"], tableHeader: ["colspan", "rowspan", "colwidth"], tableCell: ["colspan", "rowspan", "colwidth"] };
    if (!keys(attrs, attrKeys[type] ?? [])) return false;
    if ("textAlign" in attrs && attrs.textAlign !== null && !["left", "center", "right"].includes(String(attrs.textAlign))) return false;
    if (type === "heading" && (typeof attrs.level !== "number" || ![2, 3, 4].includes(attrs.level))) return false;
    if ("start" in attrs && (!Number.isInteger(attrs.start) || Number(attrs.start) < 1 || Number(attrs.start) > 10000)) return false;
    if ("language" in attrs && attrs.language !== null && (typeof attrs.language !== "string" || Array.from(attrs.language).length > 40 || control.test(attrs.language))) return false;
    for (const attr of ["colspan", "rowspan"]) if (attr in attrs && (!Number.isInteger(attrs[attr]) || Number(attrs[attr]) < 1 || Number(attrs[attr]) > 10)) return false;
    if ("colwidth" in attrs && attrs.colwidth !== null && (!Array.isArray(attrs.colwidth) || attrs.colwidth.length > 10 || attrs.colwidth.some(w => !Number.isInteger(w) || w < 20 || w > 2000))) return false;
    if (type === "image" && (++images > 30 || typeof attrs.mediaId !== "string" || !uuid.test(attrs.mediaId) || typeof attrs.alt !== "string" || !attrs.alt.trim() || Array.from(attrs.alt).length > 300 || control.test(attrs.alt) || (attrs.caption !== undefined && attrs.caption !== null && (typeof attrs.caption !== "string" || Array.from(attrs.caption).length > 500 || control.test(attrs.caption))))) return false;
    if (type === "text") {
      if (typeof node.text !== "string" || !node.text || control.test(node.text) || (characters += Array.from(node.text).length) > 100000 || node.content !== undefined || Object.keys(attrs).length) return false;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks) || node.marks.length > 8 || new Set(node.marks.map(m => object(m) ? m.type : null)).size !== node.marks.length) return false;
        for (const mark of node.marks) {
          if (!object(mark) || !keys(mark, ["type", "attrs"]) || typeof mark.type !== "string") return false;
          const a = mark.attrs ?? {}; if (!object(a)) return false;
          if (["bold", "italic", "underline", "strike", "code"].includes(mark.type)) { if (Object.keys(a).length) return false; }
          else if (mark.type === "link") { if (!keys(a, ["href", "target", "rel", "class"]) || !productContentHref(a.href) || (a.target !== undefined && a.target !== null && a.target !== "_blank") || (a.rel !== undefined && a.rel !== null && a.rel !== "noopener noreferrer nofollow") || (a.class !== undefined && a.class !== null)) return false; }
          else if (mark.type === "highlight") { if (!keys(a, ["color"]) || !PRODUCT_HIGHLIGHTS.includes(String(a.color))) return false; }
          else if (mark.type === "textStyle") { if (!keys(a, ["color", "fontSize"]) || (a.color !== undefined && a.color !== null && !PRODUCT_TEXT_COLORS.includes(String(a.color))) || (a.fontSize !== undefined && a.fontSize !== null && !PRODUCT_FONT_SIZES.includes(String(a.fontSize)))) return false; }
          else return false;
        }
      }
      return true;
    }
    if (node.text !== undefined || node.marks !== undefined) return false;
    const leaf = ["image", "horizontalRule", "hardBreak"].includes(type);
    if (leaf) return node.content === undefined || (Array.isArray(node.content) && node.content.length === 0);
    if (type === "doc" && !Array.isArray(node.content)) return false;
    const children = node.content ?? [];
    if (!Array.isArray(children) || children.length > (type === "doc" ? 200 : 500)) return false;
    const nextLists = lists + (["bulletList", "orderedList"].includes(type) ? 1 : 0);
    if (nextLists > 3 || (["bulletList", "orderedList", "table", "tableRow", "tableCell", "tableHeader", "listItem"].includes(type) && !children.length)) return false;
    return children.every(child => walk(child, type, depth + 1, nextLists));
  };
  return walk(value, "root", 0, 0) ? value as ProductRichContent : null;
}

export function legacyBlocksToRichContent(blocks: ContentBlock[]): ProductRichContent {
  const text = (value: string): RichNode[] => value ? [{ type: "text", text: value }] : [];
  return { type: "doc", content: blocks.map((block): RichNode => {
    switch (block.type) {
      case "paragraph": return { type: "paragraph", content: text(block.text) };
      case "heading": return { type: "heading", attrs: { level: block.level === 3 ? 3 : 2 }, content: text(block.text) };
      case "code": return { type: "codeBlock", attrs: { language: block.language }, content: text(block.code) };
      case "bulletList": case "orderedList": return { type: block.type, content: block.items.map(item => ({ type: "listItem", content: [{ type: "paragraph", content: text(item) }] })) };
      case "link": return { type: "paragraph", content: [{ type: "text", text: block.label, marks: [{ type: "link", attrs: { href: block.url } }] }] };
      case "image": return { type: "image", attrs: { mediaId: block.mediaId, alt: block.alt } };
      case "table": return { type: "table", content: [block.headers, ...block.rows].map((row, index) => ({ type: "tableRow", content: row.map(cell => ({ type: index ? "tableCell" : "tableHeader", content: [{ type: "paragraph", content: text(cell) }] })) })) };
    }
  }) };
}
