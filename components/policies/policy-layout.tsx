import Link from "next/link";
import { policies, type PolicySlug } from "./policy-content";
import { PolicyToc } from "./policy-toc";
import styles from "./policy.module.css";

const links: { slug: PolicySlug; label: string }[] = [
  { slug: "privacy-policy", label: "Privacy Policy" },
  { slug: "terms-and-conditions", label: "Terms & Conditions" },
  { slug: "shipping-and-returns", label: "Shipping, Returns & Cancellations" },
];

function LinkedText({ text }: { text: string }) {
  return text.split(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi).map((part, index) =>
    /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part) ? <a key={index} href={`mailto:${part}`}>{part}</a> : part,
  );
}

export function PolicyPageLayout({ slug }: { slug: PolicySlug }) {
  const policy = policies[slug];
  const used = new Map<string, number>();
  const blocks = policy.blocks.map((block) => {
    if (block.type !== "heading") return { block, id: "" };
    const base = block.text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return { block, id: count === 1 ? base : `${base}-${count}` };
  });
  const headings = blocks.filter(({ id }) => id).map(({ block, id }) => ({ id, text: block.text }));

  return <main id="main" tabIndex={-1} className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">{policy.title}</span></nav>
    <header className={styles.header}><p>Policies</p><h1>{policy.title}</h1></header>
    <div className={styles.columns}>
      <aside className={styles.sidebar}>
        <nav aria-label="Policy pages"><h2>Policies</h2><ul>{links.map((link) => <li key={link.slug}><Link href={`/${link.slug}`} aria-current={link.slug === slug ? "page" : undefined}>{link.label}</Link></li>)}</ul></nav>
        {headings.length > 0 && <PolicyToc headings={headings} />}
      </aside>
      <div className={styles.body}>
        <article className={`published-document ${styles.article}`}>
          {blocks.map(({ block, id }, index) => block.type === "heading"
            ? "level" in block && block.level === 3
              ? <h3 id={id} tabIndex={-1} key={index}>{block.text}</h3>
              : <h2 id={id} tabIndex={-1} key={index}>{block.text}</h2>
            : <p key={index}><LinkedText text={block.text} /></p>)}
        </article>
        <section className={styles.support}><h2>Questions about this policy?</h2><p><a href="mailto:pandabytehelp@gmail.com">pandabytehelp@gmail.com</a> · <Link href="/contact">Contact us</Link></p><nav aria-label="Other policies">{links.filter((link) => link.slug !== slug).map((link) => <Link key={link.slug} href={`/${link.slug}`}>{link.label}</Link>)}</nav><a href="#main">Back to top</a></section>
      </div>
    </div>
  </main>;
}
