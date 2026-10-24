import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getPublishedRecord } from "@/lib/editorial/published";
import type { SiteLink } from "@/lib/site-navigation";

async function links(group: "header" | "footer"): Promise<SiteLink[]> {
  const record = await getPublishedRecord("navigation", "primary");
  if (!record || "redirectTo" in record) return [];
  return record.document.links.filter((link)=>link.visible && link.group===group)
    .sort((a,b)=>a.position-b.position || a.label.localeCompare(b.label))
    .map(({label,href})=>({label,href}));
}
export async function PublishedHeader() {
  let additionalLinks: SiteLink[] = [];
  let unavailable = false;
  try { additionalLinks = await links("header"); }
  catch { unavailable = true; }
  return <><SiteHeader additionalLinks={additionalLinks} />{unavailable && <p role="status" className="navigation-status">Additional navigation is temporarily unavailable.</p>}</>;
}
export async function PublishedFooter() {
  let additionalLinks: SiteLink[] = [];
  try { additionalLinks = await links("footer"); }
  catch { /* Core footer links remain usable during a public-content outage. */ }
  return <SiteFooter additionalLinks={additionalLinks} />;
}
