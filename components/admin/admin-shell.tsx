"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import {
  IconChevronDown,
  IconBell,
  IconExternalLink,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import ImageComponent from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { SIDEBAR_STORAGE_KEY, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, clampSidebarWidth, readSidebarLayout, sidebarMode } from "./sidebar-layout";
import { AdminSearch } from "./admin-search";
import { dashboardItem, navigationGroups, visibleNavigationGroups } from "./admin-navigation";
import { AdminThemeProvider, AdminThemeSelect, useAdminTheme } from "./admin-theme";
import styles from "./admin-shell.module.css";

type Capability = string;

const titles = new Map<string, string>([
  [dashboardItem.href, dashboardItem.label],
  ["/admin/notifications", "Notifications"],
  ...navigationGroups.flatMap((group) => group.items.map((item) => [item.href, item.label] as const)),
]);

const groupTitles = new Map<string, string>([
  ...navigationGroups.flatMap((group) => group.items.map((item) => [item.href, group.label] as const)),
]);

const CapabilitiesContext = createContext<readonly Capability[]>([]);

export function useAdminCapabilities() {
  return useContext(CapabilitiesContext);
}

export function AdminShell({ capabilities, children, fontFamily }: {
  capabilities: Capability[];
  children: ReactNode;
  fontFamily: string;
}) {
  return (
    <AdminThemeProvider className={styles.root} fontFamily={fontFamily}>
      <AdminShellContent capabilities={capabilities} fontFamily={fontFamily}>{children}</AdminShellContent>
    </AdminThemeProvider>
  );
}

function AdminShellContent({ capabilities, children, fontFamily }: {
  capabilities: Capability[];
  children: ReactNode;
  fontFamily: string;
}) {
  const pathname = usePathname();
  const { resolvedTheme } = useAdminTheme();
  const { isLoaded, user } = useUser();
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
  const sectionTitle = pathname === "/admin" ? "Workspace" : groupTitles.get(pathname) ?? groupTitles.get(pathBase) ?? "Workspace";
  const visibleGroups = visibleNavigationGroups(capabilities);
  const DashboardIcon = dashboardItem.icon;
  const displayName = user?.fullName ?? user?.username ?? "Signed-in user";
  const displayEmail = user?.primaryEmailAddress?.emailAddress;
  const dark = resolvedTheme === "dark";
  const clerkVariables = {
    fontFamily,
    borderRadius: "0.5rem",
    colorPrimary: dark ? "#006239" : "#72e3ad",
    colorPrimaryForeground: dark ? "#dde8e3" : "#1e2723",
    colorBackground: dark ? "#171717" : "#fcfcfc",
    colorForeground: dark ? "#e2e8f0" : "#171717",
    colorMutedForeground: dark ? "#a3a3a3" : "#525252",
    colorInput: dark ? "#242424" : "#fcfcfc",
    colorInputForeground: dark ? "#e2e8f0" : "#171717",
    colorBorder: dark ? "#292929" : "#dfdfdf",
  };
  const clerkPrimaryButton = {
    backgroundColor: dark ? "#006239" : "#72e3ad",
    backgroundImage: "none",
    color: dark ? "#dde8e3" : "#1e2723",
    borderRadius: "0.5rem",
    minHeight: "44px",
  };
  const userButtonAppearance = {
    variables: clerkVariables,
    elements: { userButtonTrigger: styles.userButtonTrigger, userButtonPopoverCard: styles.accountPopover, formButtonPrimary: clerkPrimaryButton },
  };
  const userProfileAppearance = { variables: clerkVariables, elements: { rootBox: styles.accountModal, formButtonPrimary: clerkPrimaryButton } };

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
      // Clerk owns focus while its account controls are portaled outside the drawer.
      if ([...document.querySelectorAll(`.${styles.accountPopover}, .${styles.accountModal}`)].some((element) => element.getClientRects().length > 0)) return;
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
      <>
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
                <IconX aria-hidden="true" />
              </button>
            </div>

            <nav className={styles.nav} aria-label="Admin workspace">
              <Link
                className={`${styles.navLink} ${pathname === "/admin" ? styles.activeLink : ""}`}
                href="/admin"
                aria-current={pathname === "/admin" ? "page" : undefined}
                aria-label="Dashboard"
                onClick={() => setMobileOpen(false)}
              >
                <DashboardIcon aria-hidden="true" />
                <span>Dashboard</span>
              </Link>
              {visibleGroups.map((group) => {
                const groupIndex = navigationGroups.findIndex((entry) => entry.label === group.label);
                return (
                  <section className={styles.navGroup} key={group.label}>
                    <h2>
                      <button type="button" className={styles.groupToggle}
                        aria-expanded={rail || !layout.closedGroups.includes(group.label)}
                        aria-controls={`admin-group-${groupIndex}`}
                        onClick={() => setLayout((current) => ({ ...current, closedGroups: current.closedGroups.includes(group.label)
                          ? current.closedGroups.filter((label) => label !== group.label) : [...current.closedGroups, group.label] }))}>
                        {group.label}<IconChevronDown aria-hidden="true" />
                      </button>
                    </h2>
                    <div id={`admin-group-${groupIndex}`} className={styles.groupItems}
                      hidden={!rail && layout.closedGroups.includes(group.label)}>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          className={`${styles.navLink} ${active ? styles.activeLink : ""}`}
                          href={item.href}
                          key={item.href}
                          aria-current={active ? "page" : undefined}
                          aria-label={item.comingSoon ? `${item.label}, coming soon` : item.label}
                          onClick={() => setMobileOpen(false)}
                        >
                          <Icon aria-hidden="true" />
                          <span className={styles.navLabel}>
                            <span>{item.label}</span>
                            {item.comingSoon && <small>Coming soon</small>}
                          </span>
                        </Link>
                      );
                    })}
                    </div>
                  </section>
                );
              })}
            </nav>

            <div className={styles.sidebarFooter}>
              <div className={styles.userFooter}>
                {isLoaded && user && <div className={styles.userIdentity}>
                  <span className={styles.userName}>{displayName}</span>
                  {displayEmail && <span className={styles.userEmail}>{displayEmail}</span>}
                </div>}
                <UserButton appearance={userButtonAppearance} userProfileProps={{ appearance: userProfileAppearance }} />
              </div>
              <Link href="/" className={`${styles.storeLink} ${styles.navLink}`} aria-label="Open storefront"><IconExternalLink aria-hidden="true" /><span>Open storefront</span></Link>
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
                  <IconMenu2 aria-hidden="true" />
                </button>
                <button type="button" className={styles.layoutButton}
                  aria-label={layout.collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
                  aria-expanded={!layout.collapsed} aria-controls="admin-navigation"
                  onClick={() => setLayout((current) => ({ ...current, collapsed: !current.collapsed }))}>
                  {layout.collapsed ? <IconLayoutSidebarLeftExpand aria-hidden="true" /> : <IconLayoutSidebarLeftCollapse aria-hidden="true" />}
                </button>
                <button type="button" className={styles.layoutButton} aria-label="Reset admin sidebar layout"
                  onClick={() => setLayout(readSidebarLayout(null))}><IconRefresh aria-hidden="true" /></button>
                <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
                  <Link href="/admin">Workspace</Link>
                  <span aria-hidden="true">/</span>
                  {sectionTitle !== "Workspace" && <><span>{sectionTitle}</span><span aria-hidden="true">/</span></>}
                  <span aria-current="page">{title}</span>
                </nav>
              </div>
              <div className={styles.topbarActions}>
                <AdminSearch capabilities={capabilities} disableShortcut={isMobile && mobileOpen} />
                <AdminThemeSelect />
                <Link className={styles.notificationLink} href="/admin/notifications" aria-label="Notifications, coming soon"><IconBell aria-hidden="true" size={18} /></Link>
              </div>
            </header>
            <main className={styles.main} id="main" tabIndex={-1}>{children}</main>
          </div>
        </div>
      </>
    </CapabilitiesContext.Provider>
  );
}
