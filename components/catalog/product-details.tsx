import Image from "next/image";
import type { ContentBlock } from "@/lib/admin/validation";
import type { PublishedRecord } from "@/lib/editorial/published";
import styles from "./catalog.module.css";

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph": return <p>{block.text}</p>;
    case "heading": return block.level === 3 ? <h3>{block.text}</h3> : <h2>{block.text}</h2>;
    case "code": return <pre><code>{block.code}</code></pre>;
    case "bulletList": return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case "orderedList": return <ol>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ol>;
    case "link": return <p><a href={block.url} rel="noopener noreferrer">{block.label}</a></p>;
    case "image": return <Image src={`/api/media/${block.mediaId}`} alt={block.alt} width={1200} height={900} unoptimized sizes="(max-width: 760px) 100vw, 760px" />;
    case "table": return <div className={styles.tableWrap}><table>
      <thead><tr>{block.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead>
      <tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
    </table></div>;
  }
}

export function ProductDetails({ product }: { product: PublishedRecord<"products"> }) {
  const document = product.document;
  const hasSpecs = document.specifications.length > 0;
  const hasModels = Array.isArray(document.modelNumbers) && document.modelNumbers.length > 0;
  const hasCompatibility = document.compatibility.length > 0;
  const hasKitContents = document.kitContents.length > 0;
  const hasResources = document.resources.length > 0;
  const blocks = document.sourceObservation ? document.blocks.filter(block => block.type !== "image" || !document.mediaIds.includes(block.mediaId)) : document.blocks;
  const hasBlocks = blocks.length > 0;

  if (!hasSpecs && !hasModels && !hasCompatibility && !hasKitContents && !hasResources && !hasBlocks) return null;

  return <div className={styles.productSections}>
    {(hasSpecs || hasModels) && <section className={styles.productSection} aria-labelledby="product-specifications">
      <h2 id="product-specifications">Specifications</h2>
      {hasModels && <p>Models: {document.modelNumbers?.join(", ")}</p>}
      {hasSpecs && <dl className={styles.specList}>{document.specifications.map((specification, index) => <div key={`${specification.name}-${index}`}>
        <dt>{specification.name}</dt><dd>{specification.value}</dd>
      </div>)}</dl>}
    </section>}
    {hasCompatibility && <section className={styles.productSection}>
      <h2>Compatibility</h2>
      <ul className={styles.detailList}>{document.compatibility.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section>}
    {hasKitContents && <section className={styles.productSection}>
      <h2>Kit contents</h2>
      <ul className={styles.detailList}>{document.kitContents.map((item, index) => <li key={index}>{item.title} × {item.quantity}</li>)}</ul>
    </section>}
    {hasResources && <section className={styles.productSection}>
      <h2>Resources</h2>
      <ul className={styles.resourceList}>{document.resources.map((resource, index) => <li key={`${resource.url}-${index}`}>
        <a href={resource.url} rel="noopener noreferrer">{resource.label}</a>
      </li>)}</ul>
    </section>}
    {hasBlocks && <section className={styles.productSection}>
      <h2>About this product</h2>
      <article className={styles.contentBlock}>{blocks.map((block, index) => <ContentBlockView block={block} key={index} />)}</article>
    </section>}
  </div>;
}
