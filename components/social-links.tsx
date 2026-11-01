"use client";

import { Mail } from "lucide-react";
import { IconBrandInstagram, IconBrandLinkedin, IconBrandWhatsapp, IconBrandX } from "@tabler/icons-react";
import { resolveSocialLinks } from "@/lib/site-copy";
import "./social-links.css";

type SocialLink = { label: string; url: string };

const icons = [IconBrandWhatsapp, IconBrandInstagram, Mail, IconBrandX, IconBrandLinkedin];

export function SocialLinks({ links = [], email = "" }: { links?: SocialLink[]; email?: string }) {
  const { items, extra } = resolveSocialLinks(links, email);

  return <nav className="pb-social" aria-label="PandaByte social links">
    <div className="pb-social__links">
      {items.map(({ name, url }, index) => { const Icon = icons[index]; return <a
        key={name}
        className={`pb-social__link pb-social__link--${index}`}
        href={url}
        aria-label={url === "#" ? `${name} (link not available yet)` : name}
        aria-disabled={url === "#" ? true : undefined}
        onClick={url === "#" ? (event) => event.preventDefault() : undefined}
        rel={url.startsWith("https:") ? "noopener noreferrer" : undefined}
      ><Icon size={20} aria-hidden="true" /></a>; })}
      {extra.map((link, index) => <a key={`${link.url}-${index}`} className="pb-social__extra" href={link.url} rel="noopener noreferrer">{link.label}</a>)}
    </div>
    {items.some((item) => item.url === "#") && <p className="pb-social__note">Some links are coming soon.</p>}
  </nav>;
}
