const defaults = {
  supportTitle: "Engineering Support",
  supportText: "Contact PandaByte for IoT development, setup, and troubleshooting support.",
  footerTagline: "IoT hardware, learning resources and software for connected ideas.",
  copyrightName: "PandaByte Innovations Pvt Ltd",
};

export type SiteCopyInput = Partial<Record<keyof typeof defaults, string | null | undefined>>;

export function getSiteCopy(input?: SiteCopyInput | null) {
  const text = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;
  return {
    supportTitle: text(input?.supportTitle, defaults.supportTitle),
    supportText: text(input?.supportText, defaults.supportText),
    footerTagline: text(input?.footerTagline, defaults.footerTagline),
    copyrightName: text(input?.copyrightName, defaults.copyrightName),
  };
}

export function resolveSocialLinks(links: { label: string; url: string }[], email = "") {
  const visibleLinks = links.filter((link) => {
    if (/^(website|web site|whatsapp)$/i.test(link.label.trim())) return false;
    try { return !/(^|\.)whatsapp\.com$/i.test(new URL(link.url).hostname); } catch { return true; }
  });
  const platforms = [
    { name: "Instagram", match: /instagram/i, host: /(^|\.)instagram\.com$/i },
    { name: "Email", match: /^e-?mail$/i, host: /$^/ },
    { name: "X (Twitter)", match: /^(x|twitter|x \(twitter\))$/i, host: /(^|\.)(x|twitter)\.com$/i },
    { name: "LinkedIn", match: /linkedin/i, host: /(^|\.)linkedin\.com$/i },
  ];
  const used = new Set<number>();
  const items = [{ name: "WhatsApp", url: "https://www.whatsapp.com/channel/0029VaIceRtInlqNQBoRTC0J" }, ...platforms.map(({ name, match, host }) => {
    const index = visibleLinks.findIndex((link, i) => {
      if (used.has(i)) return false;
      if (match.test(link.label.trim())) return true;
      try { return host.test(new URL(link.url).hostname); } catch { return false; }
    });
    if (index >= 0) used.add(index);
    return { name, url: index >= 0 ? visibleLinks[index].url : name === "Email" && email ? `mailto:${email}` : "#" };
  })];
  return { items, extra: visibleLinks.filter((_, index) => !used.has(index)) };
}
