"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BookOpen,
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
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
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
        <div className={styles.layout}>
          <aside
            ref={sidebarRef}
            id="admin-navigation"
            className={`${styles.sidebar} ${isMobile && mobileOpen ? styles.sidebarOpen : ""}`}
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
                    <h2>{group.label}</h2>
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          className={`${styles.navLink} ${active ? styles.activeLink : ""}`}
                          href={item.href}
                          key={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setMobileOpen(false)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </section>
                );
              })}
            </nav>

            <div className={styles.sidebarFooter}>
              <Link href="/" className={styles.storeLink}>Open storefront <span aria-hidden="true">↗</span></Link>
            </div>
          </aside>

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
