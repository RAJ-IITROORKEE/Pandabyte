import Image from "next/image";
import type { ReactNode } from "react";
import { ProductTabs } from "./product-tabs";
import type { ContentBlock } from "@/lib/admin/validation";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./catalog.module.css";
import { ProductRichContentView } from "./product-rich-content";
import { ProductDocumentPreview } from "./product-document-preview";

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph": return <p>{block.text}</p>;
    case "heading": return block.level === 3 ? <h3>{block.text}</h3> : <h2>{block.text}</h2>;
    case "code": return <pre><code>{block.code}</code></pre>;
    case "bulletList": return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case "orderedList": return <ol>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ol>;
    case "link": return <p><a href={block.url} rel="noopener noreferrer">{block.label}</a></p>;
    case "image": return <Image src={`/api/media/${block.mediaId}`} alt={block.alt} width={1200} height={900} unoptimized sizes="(max-width: 760px) 100vw, 760px" />;
    case "table": return <div className={styles.tableWrap} role="region" aria-label="Product content table" tabIndex={0}><table>
      <thead><tr>{block.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
    </table></div>;
  }
}

export function ProductDetails({ product, gallery }: { product: PublishedRecord<"products">; gallery?: ReactNode }) {
  const document = product.document;
  const blocks = document.sourceObservation ? document.blocks.filter(block => block.type !== "image" || !document.mediaIds.includes(block.mediaId)) : document.blocks;
  const hasBlocks = blocks.length > 0 || Boolean(document.richContent?.content.length);
  const tabs: { label: string; content: ReactNode }[] = [];
  if (hasBlocks) tabs.push({ label: "Overview", content: <article className={styles.contentBlock}>{document.richContent ? <ProductRichContentView content={document.richContent} /> : blocks.map((block, index) => <ContentBlockView block={block} key={index} />)}</article> });
  if (document.specifications.length || document.modelNumbers?.length) tabs.push({ label: "Specifications", content: <>
    {Boolean(document.modelNumbers?.length) && <p>Models: {document.modelNumbers?.join(", ")}</p>}
    {document.specifications.length > 0 && <dl className={styles.specList}>{document.specifications.map((specification, index) => <div key={`${specification.name}-${index}`}><dt>{specification.name}</dt><dd>{specification.value}</dd></div>)}</dl>}
  </> });
  if (document.compatibility.length || document.kitContents.length || document.tags?.length) tabs.push({ label: "More details", content: <div className={styles.productSections}>
    {document.compatibility.length > 0 && <section><h2>Compatibility</h2><ul className={styles.detailList}>{document.compatibility.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
    {document.kitContents.length > 0 && <section><h2>Kit contents</h2><ul className={styles.detailList}>{document.kitContents.map((item, index) => <li key={index}>{item.title} × {item.quantity}</li>)}</ul></section>}
    {Boolean(document.tags?.length) && <section><h2>Tags</h2><ul className={styles.detailList}>{document.tags?.map(tag => <li key={tag}>{tag}</li>)}</ul></section>}
  </div> });
  if (document.resources.length || document.documentMediaId) tabs.push({ label: "Resources", content: <div className={styles.productSections}>
    {document.resources.length > 0 && <section><h2>Resources</h2><ul className={styles.resourceList}>{document.resources.map((resource, index) => <li key={`${resource.url}-${index}`}><a href={resource.url} rel="noopener noreferrer">{resource.label}</a></li>)}</ul></section>}
    {document.documentMediaId && <section><h2>Product document</h2><ProductDocumentPreview mediaId={document.documentMediaId} /></section>}
  </div> });
  if (gallery) tabs.push({ label: "Gallery", content: gallery });
  return <ProductTabs tabs={tabs} />;
}
