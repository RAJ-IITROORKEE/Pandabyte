"use client";

import Link from "next/link";

export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="foundation-content route-state" tabIndex={-1}>
      <h1 className="auth-title">This page could not be loaded.</h1>
      <p className="auth-description" role="alert">Please try again. No changes have been confirmed.</p>
      <div className="route-state-actions">
        <button className="shell-button" type="button" onClick={reset}>Try again</button>
        <Link className="site-link" href="/">Return home</Link>
      </div>
    </main>
  );
}
