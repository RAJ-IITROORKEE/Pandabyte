import Link from "next/link";
import { notFound } from "next/navigation";
import { foundationPages } from "@/lib/site-navigation";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(foundationPages).map((pathname) => ({ slug: pathname.slice(1).split("/") }));
}

export default async function FoundationPage({ params }: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const pathname = `/${slug.join("/")}`;
  const title = Object.hasOwn(foundationPages, pathname) ? foundationPages[pathname] : null;
  if (!title) notFound();

  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <p className="section-kicker">Development preview</p>
      <h1 className="auth-title">{title}</h1>
      <p className="auth-description">
        This section is being prepared. Its content and business workflows are not
        connected in this development build.
      </p>
      {pathname === "/agent" || pathname.startsWith("/products/") ? (
        <p className="auth-description">Coming soon. No release date or availability is announced.</p>
      ) : null}
      {pathname === "/policies" ? (
        <div className="policy-states">
          {[["shipping", "Shipping & returns"], ["terms", "Terms & conditions"], ["privacy", "Privacy policy"]].map(([id, heading]) => (
            <section id={id} key={id}>
              <h2>{heading}</h2>
              <p>Approved policy content will be added before launch.</p>
            </section>
          ))}
        </div>
      ) : null}
      <p><Link className="site-link" href="/">Return home</Link></p>
    </main>
  );
}
