import Image from "next/image";
import Link from "next/link";
import { resolveSiteNavigation, type NavigationLink } from "@/lib/site-navigation";
import { getSiteCopy } from "@/lib/site-copy";
import { SocialLinks } from "@/components/social-links";
import "./site-footer.css";

export function SiteFooter({ navigationLinks = [], tagline = getSiteCopy().footerTagline, copyrightName = getSiteCopy().copyrightName, socialLinks = [], email = "" }: {
  navigationLinks?: NavigationLink[];
  tagline?: string;
  copyrightName?: string;
  socialLinks?: { label: string; url: string }[];
  email?: string;
}) {
  const { footerGroups } = resolveSiteNavigation(navigationLinks);
  const availableLinks = footerGroups.flatMap(group => group.links);
  const groups = [
    { title: "Explore", hrefs: ["/shop", "/about", "/contact", "/help"] },
    { title: "Policies", hrefs: ["/policies#shipping", "/policies#terms", "/policies#privacy"] },
  ].map(group => ({ title: group.title, links: group.hrefs.flatMap(href => {
    const link = availableLinks.find(item => item.href === href);
    const policyDestinations: Record<string, string> = {
      "/policies#shipping": "/shipping-and-returns",
      "/policies#terms": "/terms-and-conditions",
      "/policies#privacy": "/privacy-policy",
    };
    return link ? [{ ...link, href: policyDestinations[href] ?? link.href }] : [];
  }) })).filter(group => group.links.length > 0);
  return (
    <footer className="pb-site-footer">
      <div className="pb-site-footer__inner">
        <div className="pb-site-footer__grid">
          <div className="pb-site-footer__brand">
            <Link className="pb-site-footer__brand-link" href="/" aria-label="PandaByte.in home">
              <span className="pb-site-footer__logo" aria-hidden="true">
                <Image
                  src="/brand/pandabyte-logo.png"
                  alt=""
                  width={558}
                  height={564}
                />
              </span>
              <span>PandaByte.in</span>
            </Link>
            <p className="pb-site-footer__tagline">{tagline}</p>
            <SocialLinks links={socialLinks} email={email} />
          </div>

          {groups.map((group) => (
            <nav className="pb-site-footer__group" aria-label={group.title} key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="pb-site-footer__bottom">
          <p>© {new Date().getFullYear()} {copyrightName}. All rights reserved.</p>
          <p>Development preview · ordering and payment are not available yet</p>
        </div>
      </div>
    </footer>
  );
}
