import Link from "next/link";
import Image from "next/image";
import { HomeCircuit } from "@/components/home-circuit";
import { HomeBrands } from "@/components/home-brands";
import { HomeHero } from "@/components/home-hero";
import { ArrowRight, ChevronRight, Clock3, Mail, MessageSquareText, Phone } from "lucide-react";
import { ProductCard } from "@/components/catalog/product-card";
import { FaqList } from "@/components/storefront/faq-list";
import { EmptyState } from "@/components/storefront/page-frame";
import { PublishedDocument } from "@/components/published-document";
import { listCatalogProducts } from "@/lib/catalog/published";
import { getPublishedRecord, listPublishedRecords } from "@/lib/editorial/published";
import styles from "@/components/home.module.css";
import sections from "@/components/home-sections.module.css";
import { publicMetadata } from "@/lib/editorial/seo";
import { permanentRedirect } from "next/navigation";
import { getSiteCopy } from "@/lib/site-copy";

const defaultTitle = "Incredible Products for all your IoT Experiments";
const defaultSummary = "Development Boards · Sensors · Shields · Accessories · IoT Kits";

export async function generateMetadata() {
  const result = await getPublishedRecord("pages","home");
  return publicMetadata(result && "document" in result ? result.document : {title:defaultTitle,slug:"home",summary:defaultSummary,blocks:[],seoTitle:"",seoDescription:""}, "/");
}

function categoryHref(slug: string): string {
  const query = new URLSearchParams({ category: slug });
  return `/shop?${query.toString()}`;
}

export default async function HomePage() {
  const [homeResult, categoryResult, products, faqs, contactResult] = await Promise.all([
    getPublishedRecord("pages", "home"),
    listPublishedRecords("categories", { limit: 100, offset: 0 }),
    listCatalogProducts({ sort: "newest", limit: 6 }),
    listPublishedRecords("faqs", { placement: "home", limit: 6, offset: 0 }),
    getPublishedRecord("contact", "contact"),
  ]);
  if (homeResult && "redirectTo" in homeResult) permanentRedirect(`/${homeResult.redirectTo}`);

  const home = homeResult && "document" in homeResult ? homeResult : null;
  const title = home?.document.title || defaultTitle;
  const summary = home ? home.document.summary : defaultSummary;
  const contact = contactResult && "document" in contactResult ? contactResult.document : null;
  const siteCopy = getSiteCopy(contact);
  const categories = [...categoryResult.items]
    .sort((left, right) => left.document.position - right.document.position || left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .slice(0, 5);

  return (
    <main id="main" tabIndex={-1} className={styles.homeMain}>
      <div className={styles.homeInner}>
        <HomeHero>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true" />IoT &amp; Embedded</p>
            <h1 id="home-title" className={styles.heroTitle}>
              {title === defaultTitle ? <>
                <span>Incredible Products</span>
                <span className={styles.titleAccent}>for all your IoT Experiments</span>
              </> : title}
            </h1>
            {summary && <p className={styles.heroSummary}>{summary}</p>}
            <div className={styles.heroActions}>
              <Link className={styles.primaryAction} href="/shop">Shop All <ArrowRight aria-hidden="true" /></Link>
              <Link className={styles.secondaryAction} href="/help">Help Center</Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <HomeCircuit />
          </div>
        </HomeHero>

        <HomeBrands />

        {home?.document.blocks.length ? (
          <section className={sections.homeContent} aria-label="Additional homepage content">
            <PublishedDocument document={{ ...home.document, summary: "" }} hideTitle />
          </section>
        ) : null}

        <section className={`${sections.contentSection} ${sections.categorySection}`} aria-labelledby="categories-title">
          <div className={sections.sectionHeading}>
            <div>
              <h2 id="categories-title">Explore Categories</h2>
              <p className={sections.categoryIntro}>Find the hardware for your next build. Category images are illustrative.</p>
            </div>
            <Link className={sections.sectionLink} href="/shop">View all products <ChevronRight aria-hidden="true" /></Link>
          </div>
          {categories.length ? (
            <nav aria-label="Published product categories" className={sections.categoryGrid}>
              {categories.map((category) => (
                <Link className={sections.categoryCard} href={categoryHref(category.slug)} key={category.id}>
                  {category.document.mediaIds[0] && <span className={sections.categoryImage}>
                    <Image src={`/api/media/${encodeURIComponent(category.document.mediaIds[0])}?w=960`} alt="" width={600} height={450} sizes="(max-width: 767px) 50vw, 20vw" unoptimized />
                  </span>}
                  <span className={sections.categoryCardLabel}>
                    <span className={sections.categoryCardTitle}>{category.title}</span>
                    <ChevronRight aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </nav>
          ) : (
            <EmptyState title="No product categories are published yet">
              <p>Published categories will appear here when they are ready to browse.</p>
            </EmptyState>
          )}
        </section>

        <section className={sections.contentSection} aria-labelledby="featured-title">
          <div className={sections.sectionHeading}>
            <div>
              <h2 id="featured-title">Featured Hardware</h2>
            </div>
            <Link className={sections.sectionLink} href="/shop">View Catalog <ChevronRight aria-hidden="true" /></Link>
          </div>
          {products.items.length ? (
            <div className={sections.productGrid}>
              {products.items.map((product) => <ProductCard key={product.id} product={product} categories={categoryResult.items} featured />)}
            </div>
          ) : (
            <EmptyState title="No products are published yet" href="/shop" label="Browse the shop">
              <p>Published products will appear here when they are ready to browse.</p>
            </EmptyState>
          )}
        </section>

        <section className={sections.supportPanel} aria-labelledby="support-title">
          <div>
            <span className={sections.supportIcon}><MessageSquareText aria-hidden="true" /></span>
            <h2 id="support-title">{siteCopy.supportTitle}</h2>
            <p>{siteCopy.supportText}</p>
            <Link className={`${styles.primaryAction} ${sections.supportAction}`} href="/contact">Contact Support <ArrowRight aria-hidden="true" /></Link>
          </div>
          {contact && (contact.phone || contact.email || contact.hours) && <address className={sections.supportContact}>
            {contact.phone && <p><Phone aria-hidden="true" /><span>Phone</span><a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}>{contact.phone}</a></p>}
            {contact.email && <p><Mail aria-hidden="true" /><span>Email</span><a href={`mailto:${contact.email}`}>{contact.email}</a></p>}
            {contact.hours && <p><Clock3 aria-hidden="true" /><span>Hours</span><span>{contact.hours}{contact.timezone ? ` (${contact.timezone})` : ""}</span></p>}
          </address>}
        </section>

        <section className={`${sections.contentSection} ${sections.faqSection}`} aria-labelledby="faq-title">
          <div className={sections.faqIntro}>
            <span className={sections.faqEyebrow}>FAQs</span>
            <h2 id="faq-title">Frequently asked questions</h2>
            <p>Find answers to common questions, or visit our help centre for more.</p>
            <Link href="/help" className={sections.faqLink}>More FAQs <ArrowRight aria-hidden="true" /></Link>
          </div>
          {faqs.items.length ? <FaqList items={faqs.items} /> : (
            <EmptyState title="No frequently asked questions are published yet">
              <p>Published answers will appear here when they are ready.</p>
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}
