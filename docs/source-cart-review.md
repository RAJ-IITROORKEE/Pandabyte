# Imported-product cart review — 27 October 2026

The owner explicitly enabled Add to Cart for the 42 imported products using their captured prices temporarily, while keeping payment disabled and preserving the separate Admin frontend and homepage hero. This supersedes earlier instructions that source products could not be added to a cart. It does not authorize orders, payment, stock inference, production deployment or content changes to real products.

## Behavior and data

- Existing stored Set/Actual integer-paise prices supply the public product amounts and server cart totals. No browser-entered price or text parsing supplies totals. The three captured discounts remain numeric Set/Actual comparisons; later Admin price edits flow through the same current-price helper.
- Source provenance and private review notes are preserved. Source variants remain `purchasable: false` for order eligibility and `availability: unavailable` because stock is unverified. A separate `cartEligible` flag enables cart review when server prices are configured. Public UI says availability/stock is unverified, and does not expose stock counts.
- Subsequent public review enables numeric source prices in catalog price ranges and price sorting. Sources with unknown stock remain outside the known available/unavailable filters. Current configured amounts are displayed without a historical-source label; the original capture remains in the separate source disclosure.
- Shop/home cards, product details and quick view use the existing cart flow. Guest carts retain existing local persistence and explicit merge behavior. Signed-in carts retain Clerk ownership, no-store responses, 50-line/1–99 quantity bounds and version conflict protection.
- Quotes include source products only through their current published route/revision. Source lines have server-calculated prices and totals, with a stock issue and `readyForCheckout: false`. The cart permits an explicit checkout **review** of these lines. Unpublished/archived/unknown products stay unavailable; saved withdrawn items can be removed.
- Checkout displays the cart and subtotal. Shipping, GST, address confirmation and final totals remain pending setup. Payment stays disabled; no stock reservation or order is created.

## Migration and reversal

Development migration `20261027161501_source-cart-review-prices.sql` replaces only the public variant projection and quote functions. Existing privileges, live-publication joins, cart ownership/version guards and Admin inventory guards remain intact. It changes no product documents, price tuples, stock balances, table data or financial history.

To disable this review later, use a forward function replacement and corresponding public UI change. Preserve saved customer cart lines so customers can review/remove unavailable items. No destructive rollback, export, backup or restore is part of this checkpoint.

## Verification

`tests/source-cart-review-integration.mjs` reads the 42 existing source products and exercises anonymous server quotes, 99-unit arithmetic, unknown products, price/eligibility tampering rejection and private-cart authentication. It makes no cart mutation. `tests/source-observation-integration.mjs` covers disposable fixture pricing, cart writes/quantities and withdrawal, plus source-note and inventory isolation.

Browser verification at localhost:3001 covered adding DHT11 through its card, quantity update and reload persistence, product Buy now to checkout review, and quick-view Add to Cart. Cart and checkout had no horizontal overflow at 320/768/1024/1440 px, and payment remained disabled. Verification items were removed to restore the owner's initially empty cart. Current evidence and limits are recorded in [verification](verification/source-cart-review.json).

Full payment/order processing, shipping/GST configuration and production deployment remain unimplemented. Actual screen-reader speech and a signed-out browser sign-in/merge journey were not rerun; guest persistence/merge logic remains covered by existing focused tests. The [subsequent storefront review](public-storefront-final-review.md) records production-build, price-filter and cart-focus follow-up.
