import Image from "next/image";
import Link from "next/link";
import { footerGroups } from "@/lib/site-navigation";
import "./site-footer.css";

export function SiteFooter() {
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

          {footerGroups.map((group) => (
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
          <p>Development preview · shopping and publishing are still in progress</p>
        </div>
      </div>
    </footer>
  );
}
