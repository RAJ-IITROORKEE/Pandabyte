import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { PublishedDocument } from "@/components/published-document";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";

const policyLinks = [
  { id: "shipping", slug: "shipping-and-returns", title: "Shipping, returns, and cancellation" },
  { id: "terms", slug: "terms-and-conditions", title: "Terms and conditions" },
  { id: "privacy", slug: "privacy-policy", title: "Privacy policy" },
] as const;

async function currentPolicy(slug: string) {
  const visited = new Set<string>();
  let currentSlug = slug;
  for (let hop = 0; hop < 8; hop += 1) {
    if (visited.has(currentSlug)) return null;
    visited.add(currentSlug);
    const record = await getPublishedRecord("pages", currentSlug);
    if (!record || !("redirectTo" in record)) return record;
    currentSlug = record.redirectTo;
  }
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedRecord("pages", "policies");
  if (page && "redirectTo" in page) return publicMetadata(null, `/${page.redirectTo}`);
  return publicMetadata(page && !("redirectTo" in page) ? page.document : null, "/policies");
}

export default async function PoliciesPage() {
  const [page, policies] = await Promise.all([
    getPublishedRecord("pages", "policies"),
    Promise.all(policyLinks.map(async (policy) => ({ ...policy, record: await currentPolicy(policy.slug) }))),
  ]);
  if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
  const document = page && !("redirectTo" in page) ? page.document : null;
  return <PublicPage eyebrow="Company" title={document?.title ?? "Policies"}>
    <div className={styles.stack}>
      {document && <PublishedDocument document={document} hideTitle />}
      {policies.map(({ id, slug, title, record }) => <section className={styles.policySection} id={id} key={id}>
        <h2>{record ? record.title : title}</h2>
        <p><Link href={`/${slug}`}>Read the full {title}</Link></p>
        {record
          ? <PublishedDocument document={record.document} hideTitle />
          : <EmptyState title="Policy copy has not been published.">This section is unavailable until its current text is approved and published.</EmptyState>}
      </section>)}
    </div>
  </PublicPage>;
}
