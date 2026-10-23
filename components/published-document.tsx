import Image from "next/image";
import type { AdminDocument, ContentBlock } from "@/lib/admin/validation";

function DocumentBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph": return <p>{block.text}</p>;
    case "heading": return block.level === 3 ? <h3>{block.text}</h3> : <h2>{block.text}</h2>;
    case "code": return <pre><code>{block.code}</code></pre>;
    case "bulletList": return <ul>{block.items.map((text, index) => <li key={index}>{text}</li>)}</ul>;
    case "orderedList": return <ol>{block.items.map((text, index) => <li key={index}>{text}</li>)}</ol>;
    case "link": return <p><a href={block.url} rel="noopener noreferrer">{block.label}</a></p>;
    case "image": return <Image unoptimized src={`/api/media/${block.mediaId}`} alt={block.alt} width={1000} height={700} style={{ objectFit: "contain", height: "auto", maxWidth: "100%" }} />;
    case "table": return <div className="document-table"><table><thead><tr>{block.headers.map((header, index) => <th scope="col" key={index}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
  }
}

export function PublishedDocument({ document }: { document: AdminDocument }) {
  return (
    <article className="published-document">
      <h1 className="auth-title">{document.title}</h1>
      {document.summary && <p className="document-summary">{document.summary}</p>}
      {"author" in document && document.author && <p>By {document.author}</p>}
      {"mediaIds" in document && document.mediaIds.map((id) => <Image unoptimized key={id} src={`/api/media/${id}`} alt={document.title} width={1000} height={700} style={{ objectFit: "contain", height: "auto", maxWidth: "100%" }} />)}
      {document.blocks.map((block, index) => <DocumentBlock key={index} block={block} />)}
      {"answer" in document && <p>{document.answer}</p>}
      {"name" in document && <section><h2>{document.name}</h2><p>{document.role}</p><p>{document.bio}</p></section>}
      {"email" in document && <address><p>{document.email}</p><p>{document.phone}</p><p>{document.address}</p><p>{document.hours} {document.timezone}</p></address>}
      {"specifications" in document && document.specifications.length > 0 && <dl>{document.specifications.map((spec, index) => <div key={index}><dt>{spec.name}</dt><dd>{spec.value}</dd></div>)}</dl>}
      {"compatibility" in document && document.compatibility.length > 0 && <section><h2>Compatibility</h2><ul>{document.compatibility.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
      {"kitContents" in document && document.kitContents.length > 0 && <section><h2>Kit contents</h2><ul>{document.kitContents.map((item, index) => <li key={index}>{item.title} × {item.quantity}</li>)}</ul></section>}
      {"resources" in document && document.resources.length > 0 && <section><h2>Resources</h2><ul>{document.resources.map((item, index) => <li key={index}><a href={item.url} rel="noopener noreferrer">{item.label}</a></li>)}</ul></section>}
      {"url" in document && document.url && <p><a href={/^[A-Za-z0-9_-]{11}$/.test(document.url) ? `https://www.youtube.com/watch?v=${document.url}` : document.url} rel="noopener noreferrer">Open resource</a></p>}
      {"links" in document && <ul>{document.links.map((link, index) => "href" in link ? link.visible && <li key={index}><a href={link.href}>{link.label}</a></li> : <li key={index}><a href={link.url} rel="noopener noreferrer">{link.label}</a></li>)}</ul>}
    </article>
  );
}
