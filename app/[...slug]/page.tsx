import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PublishedDocument } from "@/components/published-document";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { foundationPages } from "@/lib/site-navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string[] }> };

const LEGACY_POLICY_PATHS: Record<string, string> = {
  "shipping-and-returns": "/policies#shipping",
  "terms-and-conditions": "/policies#terms",
  "privacy-policy": "/policies#privacy",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;
  if (slug.length === 1 && LEGACY_POLICY_PATHS[slug[0]]) {
    return publicMetadata(null, LEGACY_POLICY_PATHS[slug[0]].split("#")[0]);
  }
  const document = slug.length === 1 ? await getPublishedRecord("pages", slug[0]) : null;
  if (document && "redirectTo" in document) return publicMetadata(null, `/${document.redirectTo}`);
  if (document) return publicMetadata(document.document, pathname);
  const title = Object.hasOwn(foundationPages, pathname) ? foundationPages[pathname] : null;
  return { title: title ? `${title} | PandaByte.in` : "Page not found | PandaByte.in", robots: { index: false, follow: false } };
}

export default async function FoundationPage({ params }: Props) {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;
  if (slug.length === 1 && LEGACY_POLICY_PATHS[slug[0]]) permanentRedirect(LEGACY_POLICY_PATHS[slug[0]]);
  if (slug.length === 1) {
    const page = await getPublishedRecord("pages", slug[0]);
    if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
    if (page) return <PublicPage eyebrow="PandaByte" title={page.title}><PublishedDocument document={page.document} hideTitle /></PublicPage>;
  }
  const title = Object.hasOwn(foundationPages, pathname) ? foundationPages[pathname] : null;
  if (!title) notFound();

  return <PublicPage eyebrow="PandaByte" title={title}>
    <div className="route-state-actions">
      <EmptyState title="This section has not been published yet.">
        {pathname === "/agent" ? "Coming soon. No release date or availability is announced." : "Its content and workflows are not connected in this development build."}
      </EmptyState>
      <Link className="site-link" href="/">Return home</Link>
    </div>
  </PublicPage>;
}
