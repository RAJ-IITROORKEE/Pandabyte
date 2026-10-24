import type { Metadata } from "next";
import { ContactForm } from "@/components/editorial/contact-form";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
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
  return <PublicPage eyebrow="Contact" title={document?.title ?? "Contact PandaByte"}>
    <div className={styles.stack}>
      {document
        ? <PublishedDocument document={document} hideTitle />
        : <EmptyState title="Contact details have not been published yet.">Use the form to send a message to the inquiry queue.</EmptyState>}
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2>Send a message</h2>
          <p>Your message is saved for the team to review. This form does not confirm email delivery.</p>
        </div>
        <ContactForm />
      </section>
    </div>
  </PublicPage>;
}
