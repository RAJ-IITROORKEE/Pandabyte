"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function SiteFrame({ children, header, footer }: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const staffWorkspace = pathname === "/staff" || pathname.startsWith("/staff/") ||
    pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/admin-login" || pathname.startsWith("/admin-login/");

  if (staffWorkspace) return children;

  if (pathname === "/panda-agent") return <><a className="skip-link" href="#main">Skip to main content</a>{children}</>;

  return (
    <div className="pb-site-frame">
      <a className="skip-link" href="#main">Skip to main content</a>
      {header}
      <div className="pb-page-content">{children}</div>
      {footer}
    </div>
  );
}
