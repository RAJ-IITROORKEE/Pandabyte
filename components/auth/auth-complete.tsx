"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AUTH_FLASH_KEY, consumeAuthAttempt } from "@/lib/auth/completion";

export function AuthComplete({ returnPath, sessionId, userId }: {
  returnPath: string;
  sessionId: string;
  userId: string;
}) {
  const router = useRouter();
  const completed = useRef(false);
  useEffect(() => {
    if (completed.current) return;
    completed.current = true;
    try {
      const now = Date.now();
      if (consumeAuthAttempt(sessionStorage, returnPath, now)) {
        sessionStorage.setItem(AUTH_FLASH_KEY, JSON.stringify({ sessionId, userId, createdAt: now }));
      }
    } catch {
      // Storage is optional; authentication and navigation still work without it.
    }
    router.replace(returnPath);
  }, [returnPath, router, sessionId, userId]);
  return <main id="main" tabIndex={-1}><p>Finishing sign in…</p></main>;
}
