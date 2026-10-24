import Image from "next/image";
import Link from "next/link";
import { footerGroups, type SiteLink } from "@/lib/site-navigation";
import "./site-footer.css";

export function SiteFooter({ additionalLinks = [] }: { additionalLinks?: SiteLink[] }) {
  const groups = footerGroups.map((group) => group.title === "Company & policies" ? {...group, links: [...group.links, ...additionalLinks.filter((link)=>!group.links.some((current)=>current.href===link.href))]} : group);
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
            <p className="pb-site-footer__tagline">Ideas into embedded innovation.</p>
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
          <p>© {new Date().getFullYear()} PandaByte. All rights reserved.</p>
          <p>Development preview · checkout is not available yet</p>
        </div>
      </div>
    </footer>
  );
}
