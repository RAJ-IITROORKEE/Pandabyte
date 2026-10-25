export type SiteLink = { label: string; href: string };

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
