"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "./contact-challenge.module.css";

export type ContactChallengeConfig = { siteKey: string | null; enabled: boolean; testMode: boolean };

type TurnstileOptions = {
  sitekey: string;
  action: "contact";
  size: "compact";
  theme: "auto";
  appearance: "always";
  "response-field": false;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function ContactChallenge({
  config,
  nonce,
  resetVersion,
  onToken,
}: {
  config: ContactChallengeConfig;
  nonce?: string;
  resetVersion: number;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCallback = useRef(onToken);
  const [status, setStatus] = useState<"loading" | "waiting" | "verified" | "expired" | "error">("loading");
  const [loadFailed, setLoadFailed] = useState(false);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);

  useEffect(() => { tokenCallback.current = onToken; }, [onToken]);

  useEffect(() => () => {
    if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    tokenCallback.current(null);
  }, []);

  useEffect(() => {
    if (!resetVersion || !widgetId.current || !window.turnstile) return;
    tokenCallback.current(null);
    setStatus("waiting");
    window.turnstile.reset(widgetId.current);
  }, [resetVersion]);

  function renderWidget() {
    if (!config.siteKey || !container.current || !window.turnstile) {
      setLoadFailed(true);
      setRuntimeAvailable(false);
      setStatus("error");
      return;
    }
    setRuntimeAvailable(true);
    if (widgetId.current) window.turnstile.remove(widgetId.current);
    container.current.replaceChildren();
    setStatus("waiting");
    setLoadFailed(false);
    try {
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: config.siteKey,
        action: "contact",
        size: "compact",
        theme: "auto",
        appearance: "always",
        "response-field": false,
        callback: (token) => {
          tokenCallback.current(token);
          setStatus("verified");
          setLoadFailed(false);
        },
        "expired-callback": () => {
          tokenCallback.current(null);
          setStatus("expired");
        },
        "error-callback": () => {
          tokenCallback.current(null);
          setStatus("error");
        },
      });
    } catch {
      widgetId.current = null;
      tokenCallback.current(null);
      setLoadFailed(true);
      setStatus("error");
    }
  }

  function retry() {
    if (!window.turnstile) {
      setRuntimeAvailable(false);
      setLoadFailed(true);
      setStatus("error");
    } else if (widgetId.current) {
      tokenCallback.current(null);
      setStatus("waiting");
      window.turnstile.reset(widgetId.current);
    } else {
      renderWidget();
    }
  }

  if (!config.enabled || !config.siteKey) {
    return <section className={styles.challenge} aria-labelledby="contact-challenge-title">
      <h3 id="contact-challenge-title">Verification</h3>
      <p className={styles.error} role="alert">Message sending is unavailable until verification is configured.</p>
    </section>;
  }

  const message = status === "loading" ? "Loading verification…"
    : status === "waiting" ? "Complete the verification to send your message."
      : status === "verified" ? "Verification complete."
        : status === "expired" ? "Verification expired. Complete it again."
          : "Verification could not be completed. Try again.";

  return <section className={styles.challenge} aria-labelledby="contact-challenge-title">
    {config.testMode && <p className={styles.testNotice}>Development test key active. This does not prove production protection.</p>}
    <h3 id="contact-challenge-title">Spam protection</h3>
    <div ref={container} className={styles.widget} />
    <p className={status === "error" ? styles.error : styles.status} role={status === "error" ? "alert" : "status"}>
      {loadFailed ? runtimeAvailable
        ? "Verification is unavailable. Your entries are still here."
        : "Verification did not load. Your entries are still here. Try again later."
        : message}
    </p>
    {runtimeAvailable && (status === "expired" || status === "error") && <button className={styles.retry} type="button" onClick={retry}>Retry verification</button>}
    <Script
      id="contact-turnstile-api"
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      nonce={nonce}
      onReady={renderWidget}
      onError={() => {
        tokenCallback.current(null);
        setRuntimeAvailable(false);
        setLoadFailed(true);
        setStatus("error");
      }}
    />
  </section>;
}
