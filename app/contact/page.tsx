import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { SocialLinks } from "@/components/social-links";
import { ContactForm } from "@/components/editorial/contact-form";
import styles from "@/components/editorial/company.module.css";
import contactStyles from "./contact-page.module.css";
import { PublishedDocument } from "@/components/published-document";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const contact = await getPublishedRecord("contact", "contact");
  return publicMetadata(contact && !("redirectTo" in contact) ? contact.document : null, "/contact");
}

export default async function ContactPage() {
  const contact = await getPublishedRecord("contact", "contact");
  const document = contact && !("redirectTo" in contact) ? contact.document : null;
  return <main id="main" tabIndex={-1} className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">Contact</span></nav>
    <header className={contactStyles.heading}>
      <h1>{document?.title ?? "Contact us"}</h1>
      <p className={styles.lede}>{document?.summary || "Have a product question or an idea for a connected project? Get in touch with PandaByte Innovations Pvt Ltd."}</p>
    </header>
    <div className={contactStyles.grid}>
      <section className={contactStyles.details} aria-labelledby="contact-details-title">
        <h2 id="contact-details-title">Let’s start a conversation</h2>
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
          {document.blocks.length > 0 && <div className={styles.contactContent}><PublishedDocument document={{ title: document.title, slug: document.slug, summary: "", blocks: document.blocks, seoTitle: document.seoTitle, seoDescription: document.seoDescription }} hideTitle /></div>}
        </> : <div className={contactStyles.intro}>
          <p>Tell us about your IoT project, learning needs or a product you are exploring.</p>
          <h3>Product questions</h3>
          <p>Looking for specifications or getting started resources? Browse our <Link href="/help">Help Center</Link> or send the team a message.</p>
          <h3>Ideas & collaborations</h3>
          <p>Share what you are building and the hardware or software you have in mind.</p>
        </div>}
        <SocialLinks links={document?.socialLinks} email={document?.email} />
      </section>
      <section className={`${contactStyles.form} ${styles.formPanel}`} aria-labelledby="contact-form-title">
        <h2 id="contact-form-title">Send a message</h2>
        <p className={styles.formNote}><MessageSquare size={18} aria-hidden="true" /><span>Your message is saved for the team to review. This form does not confirm email delivery.</span></p>
        <ContactForm />
      </section>
    </div>
    <p className={styles.helpNote}>For product questions, visit the <Link href="/help">Help Center</Link>.</p>
  </main>;
}
