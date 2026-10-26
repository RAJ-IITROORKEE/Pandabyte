"use client";

import { EmptyState, PublicPage } from "@/components/storefront/page-frame";

export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PublicPage title="Catalog unavailable" description="Published products could not be loaded right now." wide>
    <EmptyState title="Try again in a moment">
      <p>The catalog service did not return a usable response.</p>
      <button className="shell-button" type="button" onClick={reset}>Retry</button>
    </EmptyState>
  </PublicPage>;
}
