"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BookOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ExternalLink,
  Boxes,
  CircleDollarSign,
  FileText,
  Globe,
  HelpCircle,
  Image,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  ShoppingCart,
  Tags,
  Users,
  Video,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ImageComponent from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, clampSidebarWidth, readSidebarLayout, sidebarMode } from "./sidebar-layout";
import styles from "./admin-shell.module.css";

type Capability = string;

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  capability?: Capability;
};

const groups: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Products & catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: Package, capability: "catalog.edit" },
      { href: "/admin/categories", label: "Categories", icon: Tags, capability: "catalog.edit" },
      { href: "/admin/pricing", label: "Pricing", icon: CircleDollarSign, capability: "catalog.edit" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart, capability: "orders.manage" },
      { href: "/admin/inventory", label: "Inventory", icon: Boxes, capability: "orders.manage" },
      { href: "/admin/inquiries", label: "Inquiries", icon: MessageSquare, capability: "inquiries.manage" },
    ],
  },
  {
    label: "Site content",
    items: [
      { href: "/admin/pages", label: "Pages", icon: FileText, capability: "content.edit" },
      { href: "/admin/blog", label: "Blog", icon: BookOpen, capability: "content.edit" },
      { href: "/admin/faqs", label: "FAQs", icon: HelpCircle, capability: "content.edit" },
      { href: "/admin/team", label: "Team", icon: Users, capability: "content.edit" },
      { href: "/admin/contact", label: "Contact", icon: MessageSquare, capability: "content.edit" },
      { href: "/admin/navigation", label: "Navigation", icon: Globe, capability: "content.edit" },
      { href: "/admin/solutions", label: "Solutions", icon: Package, capability: "content.edit" },
      { href: "/admin/learn", label: "Learn resources", icon: BookOpen, capability: "content.edit" },
      { href: "/admin/videos", label: "Videos", icon: Video, capability: "content.edit" },
    ],
  },
  {
    label: "Assets",
    items: [{ href: "/admin/media", label: "Media", icon: Image, capability: "media.manage" }],
  },
  {
    label: "Access control",
    items: [{ href: "/admin/users", label: "Users & roles", icon: Users, capability: "staff.manage" }],
  },
];

const titles = new Map<string, string>([
  ["/admin", "Dashboard"],
  ["/admin/pricing", "Pricing"],
  ["/admin/inventory", "Inventory"],
  ["/admin/orders", "Orders"],
  ["/admin/users", "Users & roles"],
  ...groups.flatMap((group) => group.items.map((item) => [item.href, item.label] as const)),
]);

const CapabilitiesContext = createContext<readonly Capability[]>([]);

export function useAdminCapabilities() {
  return useContext(CapabilitiesContext);
}

export function AdminShell({ capabilities, children }: {
  capabilities: Capability[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewport, setViewport] = useState(1440);
  const [layout, setLayout] = useState(() => readSidebarLayout(null));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; start: number; width: number } | null>(null);
  const mode = sidebarMode(viewport, layout.collapsed);
  const rail = mode === "rail";

  useEffect(() => {
    const resizeElement = resizeRef.current;
    const update = () => {
      setViewport(window.innerWidth);
      if (window.innerWidth < 1024 && drag.current) {
        const pointer = drag.current.pointer;
        drag.current = null;
        if (resizeRef.current?.hasPointerCapture(pointer)) resizeRef.current.releasePointerCapture(pointer);
        setResizing(false);
      }
    };
    const frame = window.requestAnimationFrame(() => {
      try { setLayout(readSidebarLayout(window.localStorage.getItem(SIDEBAR_STORAGE_KEY))); } catch { /* Storage can be disabled; keep usable defaults. */ }
      setPreferencesReady(true);
      update();
    });
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      const pointer = drag.current?.pointer;
      drag.current = null;
      if (pointer !== undefined && resizeElement?.hasPointerCapture(pointer)) resizeElement.releasePointerCapture(pointer);
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady || resizing) return;
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(layout)); } catch { /* Preferences are optional. */ }
  }, [layout, preferencesReady, resizing]);
  const previousPathname = useRef(pathname);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const pathBase = pathname.split("/").slice(0, 3).join("/");
  const title = titles.get(pathname) ?? titles.get(pathBase) ?? "Admin workspace";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setMobileOpen(false);
    if (isMobile) window.requestAnimationFrame(() => document.getElementById("main")?.focus());
  }, [isMobile, pathname]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;

      const items = [...(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((item) => item.getClientRects().length > 0);
      if (!items.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, mobileOpen]);

  return (
    <CapabilitiesContext.Provider value={capabilities}>
      <div className={styles.root}>
        <a className={styles.skipLink} href="#main">Skip to admin content</a>
        {isMobile && mobileOpen && (
          <button
            className={styles.overlay}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            aria-label="Close admin navigation"
            onClick={() => {
              setMobileOpen(false);
              triggerRef.current?.focus();
            }}
          />
        )}
        <div className={styles.layout} data-rail={rail} data-resizing={resizing} style={{ "--admin-sidebar-width": `${layout.width}px` } as CSSProperties}>
          <aside
            ref={sidebarRef}
            id="admin-navigation"
            className={`${styles.sidebar} ${isMobile && mobileOpen ? styles.sidebarOpen : ""}`}
            data-rail={rail}
            aria-label="Admin navigation"
            aria-hidden={isMobile && !mobileOpen}
            aria-modal={isMobile && mobileOpen ? true : undefined}
            role={isMobile && mobileOpen ? "dialog" : undefined}
            inert={isMobile && !mobileOpen}
          >
            <div className={styles.sidebarHeader}>
              <Link className={styles.brand} href="/admin" aria-label="PandaByte admin dashboard">
                <span className={styles.logoBacking}>
                  <ImageComponent src="/brand/pandabyte-logo.png" alt="" width={40} height={40} priority />
                </span>
                <span className={styles.brandText}>
                  <strong>PandaByte.in</strong>
                  <small>Admin workspace</small>
                </span>
              </Link>
              <button
                ref={closeRef}
                className={styles.closeButton}
                type="button"
                aria-label="Close admin navigation"
                onClick={() => {
                  setMobileOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.nav} aria-label="Workspace">
              <Link
                className={`${styles.navLink} ${pathname === "/admin" ? styles.activeLink : ""}`}
                href="/admin"
                aria-current={pathname === "/admin" ? "page" : undefined}
                aria-label="Dashboard"
                onClick={() => setMobileOpen(false)}
              >
                <LayoutDashboard aria-hidden="true" />
                <span>Dashboard</span>
              </Link>
              {groups.map((group) => {
                const visibleItems = group.items.filter((item) => !item.capability || capabilities.includes(item.capability));
                if (!visibleItems.length) return null;
                return (
                  <section className={styles.navGroup} key={group.label}>
                    <h2>
                      <button type="button" className={styles.groupToggle}
                        aria-expanded={rail || !layout.closedGroups.includes(group.label)}
                        aria-controls={`admin-group-${groups.indexOf(group)}`}
                        onClick={() => setLayout((current) => ({ ...current, closedGroups: current.closedGroups.includes(group.label)
                          ? current.closedGroups.filter((label) => label !== group.label) : [...current.closedGroups, group.label] }))}>
                        {group.label}<ChevronDown aria-hidden="true" />
                      </button>
                    </h2>
                    <div id={`admin-group-${groups.indexOf(group)}`} className={styles.groupItems}
                      hidden={!rail && layout.closedGroups.includes(group.label)}>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          className={`${styles.navLink} ${active ? styles.activeLink : ""}`}
                          href={item.href}
                          key={item.href}
                          aria-current={active ? "page" : undefined}
                          aria-label={item.label}
                          onClick={() => setMobileOpen(false)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                    </div>
                  </section>
                );
              })}
            </nav>

            <div className={styles.sidebarFooter}>
              <Link href="/" className={`${styles.storeLink} ${styles.navLink}`} aria-label="Open storefront"><ExternalLink aria-hidden="true" /><span>Open storefront</span></Link>
            </div>
          </aside>

          <div ref={resizeRef} className={styles.resizeHandle} role="separator" tabIndex={0}
            aria-label="Admin sidebar width" aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH} aria-valuenow={layout.width} aria-controls="admin-navigation"
            onKeyDown={(event) => {
              let width: number | undefined;
              if (event.key === "ArrowLeft") width = layout.width - (event.shiftKey ? 32 : 8);
              if (event.key === "ArrowRight") width = layout.width + (event.shiftKey ? 32 : 8);
              if (event.key === "Home") width = SIDEBAR_MIN_WIDTH;
              if (event.key === "End") width = SIDEBAR_MAX_WIDTH;
              if (event.key === "Enter") width = SIDEBAR_DEFAULT_WIDTH;
              if (width === undefined) return;
              event.preventDefault();
              setLayout((current) => ({ ...current, width: clampSidebarWidth(width) }));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || mode !== "expanded") return;
              event.preventDefault();
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { pointer: event.pointerId, start: event.clientX, width: layout.width };
              setResizing(true);
            }}
            onPointerMove={(event) => {
              if (!drag.current || drag.current.pointer !== event.pointerId) return;
              const width = clampSidebarWidth(drag.current.width + event.clientX - drag.current.start);
              setLayout((current) => ({ ...current, width }));
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointer !== event.pointerId) return;
              drag.current = null;
              setResizing(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={(event) => {
              drag.current = null;
              setResizing(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
          />
          <div className={styles.workspace}>
            <header className={styles.topbar}>
              <div className={styles.topbarStart}>
                <button
                  ref={triggerRef}
                  className={styles.menuButton}
                  type="button"
                  aria-label="Open admin navigation"
                  aria-expanded={mobileOpen}
                  aria-controls="admin-navigation"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu aria-hidden="true" />
                </button>
                <button type="button" className={styles.layoutButton}
                  aria-label={layout.collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
                  aria-expanded={!layout.collapsed} aria-controls="admin-navigation"
                  onClick={() => setLayout((current) => ({ ...current, collapsed: !current.collapsed }))}>
                  {layout.collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
                </button>
                <button type="button" className={styles.layoutButton} aria-label="Reset admin sidebar layout"
                  onClick={() => setLayout(readSidebarLayout(null))}><RotateCcw aria-hidden="true" /></button>
                <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
                  <span>Workspace</span>
                  <span aria-hidden="true">/</span>
                  <span aria-current="page">{title}</span>
                </nav>
              </div>
              <div className={styles.topbarActions}>
                <ThemeToggle />
                <UserButton appearance={{ elements: { userButtonTrigger: styles.userButtonTrigger } }} />
              </div>
            </header>
            <main className={styles.main} id="main" tabIndex={-1}>{children}</main>
          </div>
        </div>
      </div>
    </CapabilitiesContext.Provider>
  );
}
