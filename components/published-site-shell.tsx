import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPublishedRecord } from "@/lib/editorial/published";
import type { NavigationLink } from "@/lib/site-navigation";
import { getSiteCopy } from "@/lib/site-copy";

async function links(): Promise<NavigationLink[]> {
  const record = await getPublishedRecord("navigation", "primary");
  if (!record || "redirectTo" in record) return [];
  return record.document.links;
}
export async function PublishedHeader() {
  let navigationLinks: NavigationLink[] = [];
  let unavailable = false;
  try { navigationLinks = await links(); }
  catch { unavailable = true; }
  return <><SiteHeader navigationLinks={navigationLinks} />{unavailable && <p role="status" className="navigation-status">Navigation settings are temporarily unavailable.</p>}</>;
}
export async function PublishedFooter() {
  const [navigation, contact] = await Promise.allSettled([links(), getPublishedRecord("contact", "contact")]);
  const record = contact.status === "fulfilled" ? contact.value : null;
  const document = record && "document" in record ? record.document : null;
  const copy = getSiteCopy(document);
  return <SiteFooter navigationLinks={navigation.status === "fulfilled" ? navigation.value : []} tagline={copy.footerTagline} copyrightName={copy.copyrightName} socialLinks={document?.socialLinks} email={document?.email} />;
}
