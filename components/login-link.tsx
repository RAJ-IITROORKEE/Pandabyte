"use client";

import Link from "next/link";
import { authEntryHref } from "@/lib/auth/return-path";
import { foundationPages } from "@/lib/site-navigation";

export function LoginLink() {
  return (
    <Link
      className="auth-link"
      href="/sign-in"
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const { pathname, search, hash } = window.location;
        const authRoute = ["/sign-in", "/sign-up"].some((route) =>
          pathname === route || pathname.startsWith(`${route}/`),
        );
        if (!authRoute) {
          event.preventDefault();
          window.location.assign(
            authEntryHref("sign-in", `${pathname}${search}${hash}`, Object.keys(foundationPages)),
          );
        }
      }}
    >
      Login
    </Link>
  );
}
