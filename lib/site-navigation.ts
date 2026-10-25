export type SiteLink = { label: string; href: string };
export type NavigationLink = SiteLink & {
  group: "header" | "footer";
  position?: number;
  visible?: boolean;
};

export const hardwareLinks: SiteLink[] = [
  { label: "All hardware", href: "/shop" },
  { label: "IoT kits", href: "/shop?category=iot-kits" },
  { label: "Dev Boards", href: "/shop?category=microcontroller" },
  { label: "Sensors", href: "/shop?category=sensors" },
  { label: "Shields", href: "/shop?category=shields" },
  { label: "Accessories", href: "/shop?category=accessories" },
];

export const upcomingLinks: SiteLink[] = [
  { label: "QR Logger", href: "/products/qr-logger" },
  { label: "Campus Tracker", href: "/products/campus-tracker" },
  { label: "Smart Park", href: "/products/smart-park" },
  { label: "Nexus Solution (AI)", href: "/products/nexus-solution" },
];

export const learnLinks: SiteLink[] = [
  { label: "Blogs", href: "/blog" },
  { label: "YouTube", href: "/learn/youtube" },
  { label: "Product specifications", href: "/learn/product-specs" },
  { label: "Embedded systems resources", href: "/learn/embedded-systems" },
  { label: "PandaByte kit guides", href: "/learn/kit-guides" },
  { label: "Help Center", href: "/help" },
];

export const aboutLinks: SiteLink[] = [
  { label: "About us", href: "/about" },
  { label: "Projects", href: "/projects" },
  { label: "Upcoming products", href: "/upcoming" },
  { label: "Careers", href: "/careers" },
  { label: "Contact us", href: "/contact" },
];

export const footerGroups: { title: string; links: SiteLink[] }[] = [
  { title: "Shop", links: [{ label: "Catalog", href: "/shop" }, ...hardwareLinks.slice(1, 5)] },
  { title: "Products", links: [...upcomingLinks, { label: "Future Agent · Coming soon", href: "/products/pando" }] },
  { title: "Learn & support", links: [{ label: "Learn", href: "/learn" }, ...learnLinks.filter((link) => link.href !== "/learn/embedded-systems"), { label: "Contact", href: "/contact" }, { label: "PandaByte Agent · Coming soon", href: "/agent" }] },
  { title: "Company & policies", links: [
    { label: "About", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Shipping & returns", href: "/policies#shipping" },
    { label: "Terms & conditions", href: "/policies#terms" },
    { label: "Privacy policy", href: "/policies#privacy" },
  ] },
];

const primaryHeaderLinks: SiteLink[] = [
  { label: "Solutions", href: "/solutions" },
  { label: "Learn", href: "/learn" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];
const solutionHardwareHighlight: SiteLink[] = [{ label: "IoT Kits", href: "/shop?category=iot-kits" }];
const solutionToolLinks: SiteLink[] = [
  { label: "Skills & CLI tools", href: "/solutions/skills-cli" },
  { label: "Future Agent · Coming soon", href: "/products/pando" },
];
const solutionFooterLinks: SiteLink[] = [{ label: "Explore all solutions", href: "/solutions" }];

export const CORE_NAVIGATION_HREFS = {
  header: [...new Set([
    ...primaryHeaderLinks,
    ...solutionHardwareHighlight,
    ...hardwareLinks,
    ...upcomingLinks,
    ...solutionToolLinks,
    ...solutionFooterLinks,
    ...learnLinks,
    ...aboutLinks,
  ].map(({ href }) => href))],
  footer: [...new Set(footerGroups.flatMap(({ links }) => links.map(({ href }) => href)))],
} as const;

export type ResolvedSiteNavigation = {
  header: {
    primary: SiteLink[];
    hardwareHighlight: SiteLink[];
    hardware: SiteLink[];
    upcoming: SiteLink[];
    tools: SiteLink[];
    solutionsFooter: SiteLink[];
    learn: SiteLink[];
    about: SiteLink[];
  };
  footerGroups: { title: string; links: SiteLink[] }[];
};

function resolveLinks(
  defaults: SiteLink[],
  group: NavigationLink["group"],
  overrides: readonly NavigationLink[],
  additions: readonly NavigationLink[] = [],
): SiteLink[] {
  const byHref = new Map<string, NavigationLink>();
  for (const link of overrides) {
    if (link.group === group && !byHref.has(link.href)) byHref.set(link.href, link);
  }

  return [
    ...defaults.map((link, index) => {
      const override = byHref.get(link.href);
      return {
        link: { label: override?.label ?? link.label, href: link.href },
        position: typeof override?.position === "number" && Number.isFinite(override.position) ? override.position : index,
        defaultPosition: index,
        visible: override?.visible ?? true,
      };
    }),
    ...additions.map((link, index) => ({
      link: { label: link.label, href: link.href },
      position: typeof link.position === "number" && Number.isFinite(link.position) ? link.position : defaults.length + index,
      defaultPosition: defaults.length + index,
      visible: link.visible ?? true,
    })),
  ]
    .filter(({ visible }) => visible)
    .sort((a, b) => a.position - b.position || a.defaultPosition - b.defaultPosition)
    .map(({ link }) => link);
}

export function resolveSiteNavigation(links: readonly NavigationLink[] = []): ResolvedSiteNavigation {
  const headerCoreHrefs = new Set(CORE_NAVIGATION_HREFS.header);
  const footerCoreHrefs = new Set(CORE_NAVIGATION_HREFS.footer);
  const extraHeaderLinks = links.filter((link) => link.group === "header" && !headerCoreHrefs.has(link.href) && link.visible !== false);
  const extraFooterLinks = links.filter((link) => link.group === "footer" && !footerCoreHrefs.has(link.href) && link.visible !== false);

  return {
    header: {
      primary: resolveLinks(primaryHeaderLinks, "header", links),
      hardwareHighlight: resolveLinks(solutionHardwareHighlight, "header", links),
      hardware: resolveLinks(hardwareLinks, "header", links),
      upcoming: resolveLinks(upcomingLinks, "header", links),
      tools: resolveLinks(solutionToolLinks, "header", links),
      solutionsFooter: resolveLinks(solutionFooterLinks, "header", links),
      learn: resolveLinks(learnLinks, "header", links),
      about: resolveLinks(aboutLinks, "header", links, extraHeaderLinks),
    },
    footerGroups: footerGroups.map((group) => ({
      title: group.title,
      links: resolveLinks(
        group.links,
        "footer",
        links,
        group.title === "Company & policies" ? extraFooterLinks : [],
      ),
    })),
  };
}

// Temporary route states until the later catalog and publishing phases provide data.
export const foundationPages: Record<string, string> = {
  "/shop": "Hardware catalog",
  "/solutions": "Solutions",
  "/solutions/skills-cli": "Skills & CLI tools",
  "/learn": "Learn",
  "/about": "About PandaByte",
  "/contact": "Contact PandaByte",
  "/blog": "Blogs",
  "/projects": "Projects",
  "/upcoming": "Upcoming products",
  "/careers": "Careers",
  "/help": "Help Center",
  "/policies": "Policies",
  "/cart": "Cart",
  "/agent": "PandaByte Agent · Coming soon",
  "/products/pando": "Future PandaByte Agent · Coming soon",
  ...Object.fromEntries([...upcomingLinks, ...learnLinks].map(({ href, label }) => [href, label])),
};
