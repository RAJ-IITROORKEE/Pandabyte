"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  BookOpenText,
  ChevronDown,
  Cpu,
  Layers,
  Menu,
  ShoppingCart,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { AuthControls } from "@/components/auth-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  aboutLinks,
  hardwareLinks,
  learnLinks,
  upcomingLinks,
  type SiteLink,
} from "@/lib/site-navigation";
import "@/components/site-header.css";

type MainMenu = "solutions" | "learn" | "about";
type Disclosure = "hardware" | "upcoming" | null;

export function SiteHeader({ additionalLinks = [] }: { additionalLinks?: SiteLink[] }) {
  const pathname = usePathname();
  return <SiteHeaderContent key={pathname} additionalLinks={additionalLinks} />;
}

function SiteHeaderContent({ additionalLinks }: { additionalLinks: SiteLink[] }) {
  const headerRef = useRef<HTMLElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef<Record<MainMenu, HTMLButtonElement | null>>({
    solutions: null,
    learn: null,
    about: null,
  });
  const hoverOpenedRef = useRef<MainMenu | null>(null);
  const [openMenu, setOpenMenu] = useState<MainMenu | null>(null);
  const [openDisclosure, setOpenDisclosure] = useState<Disclosure>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 980px)");
    const resetNavigation = () => {
      hoverOpenedRef.current = null;
      setOpenMenu(null);
      setOpenDisclosure(null);
      setMobileOpen(false);
    };
    const dismissOnHistoryNavigation = () => resetNavigation();

    breakpoint.addEventListener("change", resetNavigation);
    window.addEventListener("popstate", dismissOnHistoryNavigation);
    window.addEventListener("hashchange", dismissOnHistoryNavigation);
    return () => {
      breakpoint.removeEventListener("change", resetNavigation);
      window.removeEventListener("popstate", dismissOnHistoryNavigation);
      window.removeEventListener("hashchange", dismissOnHistoryNavigation);
    };
  }, []);

  useEffect(() => {
    const dismissOutside = (event: globalThis.PointerEvent | globalThis.FocusEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        hoverOpenedRef.current = null;
        setOpenMenu(null);
        setOpenDisclosure(null);
        setMobileOpen(false);
      }
    };

    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, []);

  function closeNavigation() {
    hoverOpenedRef.current = null;
    setOpenMenu(null);
    setOpenDisclosure(null);
    setMobileOpen(false);
  }

  function toggleMenu(menu: MainMenu) {
    hoverOpenedRef.current = null;
    setOpenDisclosure(null);
    setOpenMenu((current) => (current === menu ? null : menu));
  }

  function openMenuFromKeyboard(menu: MainMenu) {
    hoverOpenedRef.current = null;
    setOpenDisclosure(null);
    setOpenMenu(menu);
    requestAnimationFrame(() => {
      headerRef.current
        ?.querySelector<HTMLElement>(`[data-menu-panel="${menu}"] a, [data-menu-panel="${menu}"] summary`)
        ?.focus();
    });
  }

  function onMenuPointerEnter(menu: MainMenu) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 980px)").matches) return;
    hoverOpenedRef.current = menu;
    setOpenDisclosure(null);
    setOpenMenu(menu);
  }

  function onMenuPointerLeave(menu: MainMenu, event: ReactPointerEvent<HTMLLIElement>) {
    if (
      hoverOpenedRef.current === menu &&
      !event.currentTarget.contains(document.activeElement)
    ) {
      hoverOpenedRef.current = null;
      setOpenDisclosure(null);
      setOpenMenu(null);
    }
  }

  function onMenuTriggerClick(menu: MainMenu) {
    if (hoverOpenedRef.current === menu) {
      hoverOpenedRef.current = null;
      return;
    }
    toggleMenu(menu);
  }

  function onMenuBlur(menu: MainMenu, event: ReactFocusEvent<HTMLLIElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      if (hoverOpenedRef.current === menu) hoverOpenedRef.current = null;
      setOpenMenu((current) => (current === menu ? null : current));
      setOpenDisclosure(null);
    }
  }

  function onHeaderKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;

    if (openMenu) {
      event.preventDefault();
      hoverOpenedRef.current = null;
      setOpenMenu(null);
      setOpenDisclosure(null);
      triggerRefs.current[openMenu]?.focus();
    } else if (mobileOpen) {
      event.preventDefault();
      closeNavigation();
      mobileToggleRef.current?.focus();
    }
  }

  function toggleDisclosure(event: MouseEvent<HTMLElement>, disclosure: Exclude<Disclosure, null>) {
    event.preventDefault();
    setOpenDisclosure((current) => (current === disclosure ? null : disclosure));
  }

  function onDisclosureKeyDown(event: KeyboardEvent<HTMLDetailsElement>, disclosure: Exclude<Disclosure, null>) {
    if (event.key === "Escape" && openDisclosure === disclosure) {
      event.preventDefault();
      event.stopPropagation();
      setOpenDisclosure(null);
      event.currentTarget.querySelector("summary")?.focus();
    }
  }

  function onDisclosureSummaryKeyDown(event: KeyboardEvent<HTMLElement>, disclosure: Exclude<Disclosure, null>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setOpenDisclosure(disclosure);
    const details = event.currentTarget.parentElement;
    requestAnimationFrame(() => {
      details?.querySelector<HTMLElement>("a")?.focus();
    });
  }

  function renderMenuItems(links: typeof learnLinks) {
    return links.map(({ label, href }) => (
      <Link className="pb-menu-link" href={href} key={href} onClick={closeNavigation}>
        {label}
      </Link>
    ));
  }

  return (
    <header
      className="pb-site-header"
      data-mobile-open={mobileOpen}
      ref={headerRef}
      onKeyDown={onHeaderKeyDown}
    >
      <div className="pb-header-inner">
        <Link className="pb-brand" href="/" aria-label="PandaByte home" onClick={closeNavigation}>
          <span className="pb-logo">
            <Image src="/brand/pandabyte-logo.png" alt="" width={40} height={40} priority />
          </span>
          <span className="pb-wordmark">PandaByte.in</span>
        </Link>

        <button
          className="pb-mobile-toggle pb-icon-button"
          type="button"
          ref={mobileToggleRef}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="pb-main-navigation"
          onClick={() => {
            setMobileOpen((open) => !open);
            setOpenMenu(null);
            setOpenDisclosure(null);
          }}
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav className="pb-main-nav" id="pb-main-navigation" aria-label="Main navigation">
          <ul className="pb-nav-list">
            <li
              className="pb-nav-item"
              onPointerEnter={() => onMenuPointerEnter("solutions")}
              onPointerLeave={(event) => onMenuPointerLeave("solutions", event)}
              onBlurCapture={(event) => onMenuBlur("solutions", event)}
            >
              <div className="pb-nav-label">
                <Link href="/solutions" onClick={closeNavigation}>Solutions</Link>
                <button
                  ref={(node) => { triggerRefs.current.solutions = node; }}
                  className="pb-disclose"
                  type="button"
                  aria-label="Open Solutions menu"
                  aria-expanded={openMenu === "solutions"}
                  aria-controls="pb-solutions-menu"
                  onClick={() => onMenuTriggerClick("solutions")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      openMenuFromKeyboard("solutions");
                    }
                  }}
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              <div
                className="pb-menu pb-solutions-menu"
                id="pb-solutions-menu"
                data-menu-panel="solutions"
                hidden={openMenu !== "solutions"}
              >
                <div className="pb-solution-grid">
                  <div className="pb-solution-column">
                    <p className="pb-menu-intro"><Layers aria-hidden="true" /> Hardware</p>
                    <Link className="pb-icon-row" href="/shop?category=kit" onClick={closeNavigation}>
                      <Cpu aria-hidden="true" />
                      <span><strong>IoT Kits</strong><small>Explore PandaByte kits</small></span>
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                    <details
                      className="pb-nested"
                      open={openDisclosure === "hardware"}
                      onKeyDown={(event) => onDisclosureKeyDown(event, "hardware")}
                    >
                      <summary
                        aria-expanded={openDisclosure === "hardware"}
                        aria-controls="pb-hardware-links"
                        onClick={(event) => toggleDisclosure(event, "hardware")}
                        onKeyDown={(event) => onDisclosureSummaryKeyDown(event, "hardware")}
                      >
                        <span><strong>Shop IoT &amp; embedded products</strong></span>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      <div className="pb-submenu" id="pb-hardware-links">
                        {renderMenuItems(hardwareLinks)}
                      </div>
                    </details>
                  </div>
                  <div className="pb-solution-column pb-solution-secondary">
                    <p className="pb-menu-intro"><Layers aria-hidden="true" /> Products &amp; tools</p>
                    <details
                      className="pb-nested"
                      open={openDisclosure === "upcoming"}
                      onKeyDown={(event) => onDisclosureKeyDown(event, "upcoming")}
                    >
                      <summary
                        aria-expanded={openDisclosure === "upcoming"}
                        aria-controls="pb-upcoming-links"
                        onClick={(event) => toggleDisclosure(event, "upcoming")}
                        onKeyDown={(event) => onDisclosureSummaryKeyDown(event, "upcoming")}
                      >
                        <span><strong>Products</strong><small>Upcoming PandaByte projects</small></span>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      <div className="pb-submenu" id="pb-upcoming-links">
                        {renderMenuItems(upcomingLinks)}
                      </div>
                    </details>
                    <Link className="pb-icon-row" href="/solutions/skills-cli" onClick={closeNavigation}>
                      <Terminal aria-hidden="true" />
                      <span><strong>Skills &amp; CLI tools</strong><small>For IoT &amp; embedded development</small></span>
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                    <Link
                      className="pb-icon-row"
                      href="/products/pando"
                      aria-label="Future Agent, coming soon"
                      onClick={closeNavigation}
                    >
                      <Bot aria-hidden="true" />
                      <span><strong>Future Agent <span className="pb-coming-soon">Coming soon</span></strong><small>Future PandaByte Agent concept</small></span>
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  </div>
                </div>
                <div className="pb-menu-footer">
                  <Link href="/solutions" onClick={closeNavigation}>Explore all solutions <ArrowUpRight aria-hidden="true" /></Link>
                </div>
              </div>
            </li>

            <li
              className="pb-nav-item"
              onPointerEnter={() => onMenuPointerEnter("learn")}
              onPointerLeave={(event) => onMenuPointerLeave("learn", event)}
              onBlurCapture={(event) => onMenuBlur("learn", event)}
            >
              <div className="pb-nav-label">
                <Link href="/learn" onClick={closeNavigation}>Learn</Link>
                <button
                  ref={(node) => { triggerRefs.current.learn = node; }}
                  className="pb-disclose"
                  type="button"
                  aria-label="Open Learn menu"
                  aria-expanded={openMenu === "learn"}
                  aria-controls="pb-learn-menu"
                  onClick={() => onMenuTriggerClick("learn")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      openMenuFromKeyboard("learn");
                    }
                  }}
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              <div className="pb-menu" id="pb-learn-menu" data-menu-panel="learn" hidden={openMenu !== "learn"}>
                <p className="pb-menu-intro"><BookOpenText aria-hidden="true" /> Learn &amp; explore</p>
                {renderMenuItems(learnLinks)}
              </div>
            </li>

            <li
              className="pb-nav-item"
              onPointerEnter={() => onMenuPointerEnter("about")}
              onPointerLeave={(event) => onMenuPointerLeave("about", event)}
              onBlurCapture={(event) => onMenuBlur("about", event)}
            >
              <div className="pb-nav-label">
                <Link href="/about" onClick={closeNavigation}>About</Link>
                <button
                  ref={(node) => { triggerRefs.current.about = node; }}
                  className="pb-disclose"
                  type="button"
                  aria-label="Open About menu"
                  aria-expanded={openMenu === "about"}
                  aria-controls="pb-about-menu"
                  onClick={() => onMenuTriggerClick("about")}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      openMenuFromKeyboard("about");
                    }
                  }}
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              <div className="pb-menu" id="pb-about-menu" data-menu-panel="about" hidden={openMenu !== "about"}>
                <p className="pb-menu-intro">PandaByte</p>
                {renderMenuItems([...aboutLinks, ...additionalLinks.filter((link)=>!aboutLinks.some((current)=>current.href===link.href))])}
              </div>
            </li>

            <li className="pb-contact"><Link href="/contact" onClick={closeNavigation}>Contact</Link></li>
          </ul>
        </nav>

        <div className="pb-header-actions">
          <Link className="pb-agent-link" href="/agent" aria-label="Agent tools, coming soon" onClick={closeNavigation}>
            <Sparkles aria-hidden="true" />
            <span className="pb-agent-label" aria-hidden="true"><span>Agent</span><span>Coming soon</span></span>
          </Link>
          <AuthControls />
          <Link className="pb-icon-button pb-cart-link" href="/cart" aria-label="Cart" onClick={closeNavigation}>
            <ShoppingCart aria-hidden="true" />
          </Link>
          <span className="pb-theme-action"><ThemeToggle /></span>
        </div>
      </div>
    </header>
  );
}
