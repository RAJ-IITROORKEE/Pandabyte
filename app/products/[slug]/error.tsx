"use client";

import { EmptyState, PublicPage } from "@/components/storefront/page-frame";

export default function ProductError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PublicPage eyebrow="Product" title="Product unavailable" description="Current published product details could not be loaded." wide>
    <EmptyState title="Try again in a moment">
      <p>The product service did not return a usable response.</p>
      <button className="shell-button" type="button" onClick={reset}>Retry</button>
    </EmptyState>
  </PublicPage>;
}
