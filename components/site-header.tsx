"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Search, X } from "lucide-react";
import { AuthControls } from "@/components/auth-controls";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu";
import { resolveSiteNavigation, type NavigationLink, type SiteLink } from "@/lib/site-navigation";
import "@/components/site-header.css";

type MenuSection = { title: string; links: SiteLink[]; comingSoon?: boolean };

export function SiteHeader({ navigationLinks = [] }: { navigationLinks?: NavigationLink[] }) {
  const pathname = usePathname();
  return <SiteHeaderContent pathname={pathname} navigationLinks={navigationLinks} onCartPage={pathname === "/cart"} />;
}

function SiteHeaderContent({ pathname, navigationLinks, onCartPage }: { pathname: string; navigationLinks: NavigationLink[]; onCartPage: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    setMobileOpen(false);
  }
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { header } = resolveSiteNavigation(navigationLinks);
  const primary = (href: string) => header.primary.filter((link) => link.href === href);
  const menus: { label: string; sections: MenuSection[] }[] = [
    { label: "Products", sections: [{ title: "Hardware", links: header.hardware }] },
    { label: "Solutions", sections: [
      { title: "Explore", links: [...primary("/solutions"), { label: "Panda Agent", href: "/panda-agent" }, ...header.tools.filter((link) => link.href === "/solutions/skills-cli")] },
      { title: "Coming soon", links: [...header.upcoming, ...header.tools.filter((link) => link.href !== "/solutions/skills-cli"), { label: "Agent tools", href: "/agent" }], comingSoon: true },
    ] },
    { label: "Company", sections: [
      { title: "PandaByte", links: header.about },
      { title: "Learn & support", links: [...primary("/learn"), ...header.learn] },
    ] },
  ];

  useEffect(() => {
    if (!mobileOpen) return;
    const dismiss = (event: globalThis.PointerEvent | globalThis.FocusEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMobileOpen(false);
    };
    const breakpoint = window.matchMedia("(min-width: 980px)");
    const reset = () => setMobileOpen(false);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    breakpoint.addEventListener("change", reset);
    window.addEventListener("popstate", reset);
    window.addEventListener("hashchange", reset);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      breakpoint.removeEventListener("change", reset);
      window.removeEventListener("popstate", reset);
      window.removeEventListener("hashchange", reset);
    };
  }, [mobileOpen]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && mobileOpen) {
      event.preventDefault();
      setMobileOpen(false);
      toggleRef.current?.focus();
    }
  }

  function sections(items: MenuSection[], desktop: boolean) {
    return items.filter((section) => section.links.length > 0).map((section) => (
      <div className="pb-menu-section" key={section.title}>
        <p className="pb-menu-heading">{section.title}</p>
        {section.links.map((link) => {
          const label = section.comingSoon ? link.label.replace(/\s*[·-]\s*coming soon\s*$/i, "") : link.label;
          const content = <>{label}{link.href === "/panda-agent" && <span className="pb-new-badge">New</span>}{section.comingSoon && <span className="pb-coming-soon">Coming soon</span>}</>;
          return desktop ? <NavigationMenuLink asChild key={link.href}><Link className="pb-menu-link" href={link.href}>{content}</Link></NavigationMenuLink>
            : <Link className="pb-menu-link" href={link.href} key={link.href} onClick={() => setMobileOpen(false)}>{content}</Link>;
        })}
      </div>
    ));
  }

  return (
    <header className="pb-site-header" ref={headerRef} onKeyDown={onKeyDown}>
      <div className="pb-header-inner">
        <Link className="pb-brand" href="/" aria-label="PandaByte home" onClick={() => setMobileOpen(false)}>
          <span className="pb-logo"><Image src="/brand/pandabyte-logo.png" alt="" width={40} height={40} priority /></span>
          <span className="pb-wordmark">PandaByte.in</span>
        </Link>

        <NavigationMenu key={pathname} className="pb-desktop-nav" aria-label="Main navigation">
          <NavigationMenuList className="pb-nav-list">
            {menus.map((menu, index) => <Fragment key={menu.label}>
              {index === 2 && <NavigationMenuItem><NavigationMenuLink asChild><Link className="pb-nav-link" href="/shop">Shop</Link></NavigationMenuLink></NavigationMenuItem>}
              <NavigationMenuItem className="pb-nav-item">
                <NavigationMenuTrigger className="pb-nav-trigger" disabled={!menu.sections.some((section) => section.links.length)}>{menu.label}</NavigationMenuTrigger>
                <NavigationMenuContent className="pb-menu">{sections(menu.sections, true)}</NavigationMenuContent>
              </NavigationMenuItem>
            </Fragment>)}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="pb-header-actions">
          <Link className="pb-icon-button" href="/shop#catalog-query" aria-label="Search catalog" onClick={() => setMobileOpen(false)}><Search aria-hidden="true" /></Link>
          <CartDrawer key={pathname} onCartPage={onCartPage} onOpen={() => setMobileOpen(false)} />
          <AuthControls />
          <span className="pb-theme-action"><ThemeToggle /></span>
        </div>
        <button className="pb-mobile-toggle pb-icon-button" type="button" ref={toggleRef} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls={mobileOpen ? "pb-mobile-navigation" : undefined} onClick={() => setMobileOpen((open) => !open)}>
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {mobileOpen && <nav className="pb-mobile-nav" id="pb-mobile-navigation" aria-label="Main navigation">
        {menus.map((menu, index) => <div key={menu.label}>
          {index === 2 && <Link className="pb-mobile-direct" href="/shop" onClick={() => setMobileOpen(false)}>Shop</Link>}
          <details className="pb-mobile-disclosure">
            <summary>{menu.label}<ChevronDown aria-hidden="true" /></summary>
            <div className="pb-mobile-sections">{sections(menu.sections, false)}</div>
          </details>
        </div>)}
      </nav>}
    </header>
  );
}
