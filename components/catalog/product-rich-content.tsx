import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { parseProductRichContent, type ProductRichContent, type RichNode } from "@/lib/admin/product-content";
import styles from "./product-rich-content.module.css";

function NodeView({ node }: { node: RichNode }) {
  const a = node.attrs ?? {};
  const children = node.content?.map((child, i) => <NodeView node={child} key={i} />);
  const align = a.textAlign ? { textAlign: a.textAlign as CSSProperties["textAlign"] } : undefined;
  switch (node.type) {
    case "text": {
      let text: ReactNode = node.text;
      for (const [i, mark] of (node.marks ?? []).entries()) {
        const attrs = mark.attrs ?? {};
        switch (mark.type) {
          case "bold": text = <strong key={i}>{text}</strong>; break;
          case "italic": text = <em key={i}>{text}</em>; break;
          case "underline": text = <u key={i}>{text}</u>; break;
          case "strike": text = <s key={i}>{text}</s>; break;
          case "code": text = <code key={i}>{text}</code>; break;
          case "link": text = <a key={i} href={attrs.href} rel="noopener noreferrer nofollow">{text}</a>; break;
          case "highlight": text = <mark key={i} style={{ backgroundColor: attrs.color, color: "#171717" }}>{text}</mark>; break;
          case "textStyle": text = <span key={i} style={{ ...(attrs.color ? { color: attrs.color, backgroundColor: "#ffffff", borderRadius: 2 } : {}), fontSize: attrs.fontSize ?? undefined }}>{text}</span>; break;
        }
      }
      return text;
    }
    case "paragraph": return <p style={align}>{children?.length ? children : <br />}</p>;
    case "heading": return a.level === 4 ? <h4 style={align}>{children}</h4> : a.level === 3 ? <h3 style={align}>{children}</h3> : <h2 style={align}>{children}</h2>;
    case "bulletList": return <ul>{children}</ul>;
    case "orderedList": return <ol start={Number(a.start ?? 1)}>{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "blockquote": return <blockquote>{children}</blockquote>;
    case "codeBlock": return <pre><code>{children}</code></pre>;
    case "horizontalRule": return <hr />;
    case "hardBreak": return <br />;
    case "image": return <figure><Image src={`/api/media/${a.mediaId}?w=960`} alt={String(a.alt)} width={1200} height={900} unoptimized sizes="(max-width: 760px) 100vw, 760px" />{a.caption && <figcaption>{String(a.caption)}</figcaption>}</figure>;
    case "table": return <div className={styles.tableWrap} role="region" aria-label="Product content table" tabIndex={0}><table><tbody>{children}</tbody></table></div>;
    case "tableRow": return <tr>{children}</tr>;
    case "tableHeader": return <th colSpan={Number(a.colspan ?? 1)} rowSpan={Number(a.rowspan ?? 1)}>{children}</th>;
    case "tableCell": return <td colSpan={Number(a.colspan ?? 1)} rowSpan={Number(a.rowspan ?? 1)}>{children}</td>;
    default: return children;
  }
}

export function ProductRichContentView({ content }: { content: ProductRichContent }) {
  if (!parseProductRichContent(content)) return <p>Product content is unavailable.</p>;
  return <div className={styles.content}><NodeView node={content} /></div>;
}
