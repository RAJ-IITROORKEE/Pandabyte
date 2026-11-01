"use client";

import { useAuth, useSession } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { consumeAuthFlash } from "@/lib/auth/completion";

const AuthSuccessToast = dynamic(
  () => import("@/components/auth/auth-success-toast").then((module) => module.AuthSuccessToast),
  { ssr: false },
);

export function SessionFeedback({ nonce }: { nonce?: string }) {
  const { isLoaded, isSignedIn, sessionId, userId } = useAuth();
  const { session } = useSession();
  const pathname = usePathname();
  const [shownSession, setShownSession] = useState<string | null>(null);
  const active = isLoaded && isSignedIn && sessionId && userId && session?.status === "active";

  useEffect(() => {
    if (!active || !sessionId || !userId) return;
    const timer = window.setTimeout(() => {
      try {
        if (consumeAuthFlash(sessionStorage, sessionId, userId, Date.now())) setShownSession(sessionId);
      } catch {
        // Storage is optional; no notification is shown if it is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, sessionId, userId, pathname]);

  return active && shownSession === sessionId ? <AuthSuccessToast key={sessionId} nonce={nonce} /> : null;
}
