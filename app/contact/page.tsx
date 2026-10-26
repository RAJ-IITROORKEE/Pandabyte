import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { ContactForm } from "@/components/editorial/contact-form";
import styles from "@/components/editorial/company.module.css";
import { Card, CardTitle } from "@/components/ui/card";
import { PublishedDocument } from "@/components/published-document";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { headers } from "next/headers";
import { contactProtection } from "@/lib/contact/turnstile";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const contact = await getPublishedRecord("contact", "contact");
  return publicMetadata(contact && !("redirectTo" in contact) ? contact.document : null, "/contact");
}

export default async function ContactPage() {
  const protection = contactProtection(process.env);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const contact = await getPublishedRecord("contact", "contact");
  const document = contact && !("redirectTo" in contact) ? contact.document : null;
  return <main id="main" tabIndex={-1} className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
    <header className={styles.heading}>
      <p className="section-kicker">Contact</p>
      <h1>{document?.title ?? "Contact PandaByte"}</h1>
      <p className={styles.lede}>{document?.summary || "Send a message to the PandaByte team."}</p>
    </header>
    <div className={styles.contactGrid}>
      <Card as="section" className={styles.panel} aria-labelledby="contact-details-title">
        <CardTitle as="h2" id="contact-details-title">Contact details</CardTitle>
        {document ? <>
          <dl className={styles.details}>
            {document.email && <div><dt><Mail size={18} aria-hidden="true" />Email</dt><dd><a href={`mailto:${document.email}`}>{document.email}</a></dd></div>}
            {document.phone && <div><dt><Phone size={18} aria-hidden="true" />Phone</dt><dd>{document.phone}</dd></div>}
            {(document.hours || document.timezone) && <div><dt><Clock3 size={18} aria-hidden="true" />Hours</dt><dd>{document.hours} {document.timezone}</dd></div>}
            {document.address && <div><dt><MapPin size={18} aria-hidden="true" />Address</dt><dd><address>{document.address}</address></dd></div>}
          </dl>
          {(document.supportTitle || document.supportText) && <div className={styles.support}>
            {document.supportTitle && <h3>{document.supportTitle}</h3>}
            {document.supportText && <p>{document.supportText}</p>}
          </div>}
          {document.socialLinks.length > 0 && <nav className={styles.social} aria-label="PandaByte social links">{document.socialLinks.map((link, index) => <a key={index} href={link.url} rel="noopener noreferrer">{link.label}</a>)}</nav>}
          {document.blocks.length > 0 && <div className={styles.contactContent}><PublishedDocument document={{ title: document.title, slug: document.slug, summary: "", blocks: document.blocks, seoTitle: document.seoTitle, seoDescription: document.seoDescription }} hideTitle /></div>}
        </> : <div className={styles.empty}>
          <Mail size={24} aria-hidden="true" />
          <h3>Contact details have not been published yet.</h3>
          <p>Use the form to send a message to the inquiry queue.</p>
        </div>}
      </Card>
      <Card as="section" className={`${styles.panel} ${styles.formPanel}`} aria-labelledby="contact-form-title">
        <CardTitle as="h2" id="contact-form-title">Send a message</CardTitle>
        <p className={styles.formNote}><MessageSquare size={18} aria-hidden="true" /><span>Your message is saved for the team to review. This form does not confirm email delivery.</span></p>
        <ContactForm challengeConfig={{ enabled: !!protection, siteKey: protection?.siteKey ?? null, testMode: protection?.testMode ?? false }} nonce={nonce} />
      </Card>
    </div>
    <p className={styles.helpNote}>For product questions, visit the <Link href="/help">Help Center</Link>.</p>
  </main>;
}
