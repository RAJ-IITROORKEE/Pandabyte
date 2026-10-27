# Public storefront review — 27 October 2026

The owner requested continuation after imported-product cart review. This checkpoint covers public catalog consistency, cart accessibility and a local production build. Admin, the homepage hero, source artifacts, real product content and the payment/order boundary are preserved.

## Fixes

- Source prices now participate in range filters and price sorting. Before the fix, the INR 100–500 range returned none of the 22 matching imported products. The bounded SQL query helper now uses existing numeric effective prices while preserving publication/withdrawal checks, pagination, the wrapper's rich-content projection and all permissions. Unknown stock still does not match either known available or unavailable stock filters.
- Configured current prices no longer carry a `Source price` label that could become misleading after later price edits. The original captured price/date/link remain in the product source disclosure. Historical fallback amounts still identify their source.
- Cart load failures have alert semantics. Successful item removal moves keyboard focus to the remaining Items heading, or the empty-cart heading after the last item. Focus waits for the refreshed guest quote; failed removals, retries and quantity changes do not move it.

Development migration `20261027173001_source-catalog-price-filters.sql` replaces only the public catalog query helper. It changes no product, price, stock or customer rows. A forward helper replacement can reverse the range/sort change without deleting data.

## Remaining content

The existing purchase-availability FAQ still accurately says that orders cannot be placed, but does not describe cart review. No CMS answer was changed or published in this checkpoint. Suggested replacement for owner review:

> Check the availability shown on each product page. Imported products use provisional catalog prices and can be added to a cart for subtotal review. Their stock remains unverified. Order placement and payment are disabled; shipping and GST are pending setup.

Approved company/team identities and photographs, public contact details, policy text, real blog articles and learning/solution content remain owner content decisions. Shipping/GST settings and verified stock are separate operational requirements. No company claims, stock or tax values were invented.

## Verification and limits

Twenty-four focused accessibility/checkout/pricing/query tests, targeted lint and the isolated production build passed. The read-only catalog price and source-quote integration checks passed in development and on a temporary local production server. Built-in-browser verification confirmed keyboard removal/empty-cart focus, the 22 matching price-filter results, loaded product images, current-price presentation and no observed hydration warning in production mode. Payment/order code remains disabled. The owner's initially empty cart was restored after verification. Local build output uses `.bootstrap/frontend-next-review` so localhost:3001 and the other chat's work are not replaced. The temporary local production server is stopped after checks; no hosted deployment occurred.

Actual screen-reader speech, runtime reduced-motion switching and the signed-out browser sign-in/merge journey remain unverified. No production deployment, order, reservation or payment is added. [Verification record](verification/public-storefront-final-review.json).
