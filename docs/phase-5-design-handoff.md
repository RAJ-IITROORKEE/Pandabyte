# Phase 5 commerce and operations design handoff

Prepared 24 October 2026 from the current approved design previews, implementation plan, and source tree. This is a frontend handoff, not an API/schema contract. The official Superdesign CLI preflight succeeded (v0.14.0, authenticated to the Personal team); the four current drafts below were fetched read-only. No designs were generated or edited and no credits were used. HTML source was inspected; localhost/browser behavior was not tested in this audit.

**Implementation decision after this audit:** the owner selected Razorpay test mode and removed the ₹5,000 minimum for Razorpay. Omit the historical checkout notice from application UI. Indian GST was requested; specific product/merchant tax inputs and shipping settings remain pending. The [Phase 5 contract](phase-5-contract.md) supersedes this audit's earlier open minimum questions. Cart implementation is an independent checkpoint, not completed checkout/payment/operations.

## Selected screens

| Screen | Current draft | Version | Design coverage and limits |
| --- | --- | ---: | --- |
| Cart | [PandaByte — Cart](https://p.superdesign.dev/draft/7141b0f5-50eb-41df-963b-9f43c8dc6d0c) | 7 | Basket and empty state. Its two products, prices, quantities, and local interactions are illustrative only. |
| Checkout | [PandaByte — Checkout](https://p.superdesign.dev/draft/c6fa60d8-1132-4a62-ab72-d0a88cf37dda) | 7 | Contact/delivery form, checkout-only ₹5,000 notice, and pending, failed, canceled, retry, and success previews. Every payment/session control is a local simulation; no payment is initiated. |
| Account and orders | [PandaByte — Account and orders](https://p.superdesign.dev/draft/e14fbb05-b2ab-4305-803f-2c7b28768732) | 7 | Overview, orders, addresses, and profile states. Its account is disconnected and contains no real order or address data. It does not provide a dedicated order-detail screen. |
| Admin operations | [PandaByte — Admin operations](https://p.superdesign.dev/draft/e2ad89c7-03ec-404c-81b6-b0e78f676572) | 9 | Order list, filters, access/error/empty/loading states, and an order-detail panel. It contains no connected records, queue/payment/fulfillment metrics, or working status action. It is the only selected admin-orders screen. |

Use the current application shell, original logo, theme tokens, and shared navigation. The standalone draft headers, footers, and browser-local demo behavior are not production components or data sources. Preserve explicit empty, pending, failure, cancellation, and access-denied states, but connect them to actual server responses.

## Application boundary at the read-only audit, before cart implementation

- `app/checkout/page.tsx` requires a Clerk session and sends signed-out visitors to sign-in with `/checkout` as the return path. Signed-in visitors see the honest “Checkout is not connected yet” state.
- `app/admin/orders/page.tsx` displays an unavailable-for-Phase-3 notice. The admin shell already exposes Orders behind `orders.manage`.
- `/cart` is linked from the shared header/navigation but has no page yet. There is no account order-history route.
- `/account` verifies the Clerk subject against the InsForge identity bridge before showing profile and address UI. It has no orders yet; keep that ownership boundary for order reads.
- The inspected app/API tree has no cart, order, payment, refund, or fulfillment handlers. Do not infer table names, DTOs, status enums, or provider behavior from these visual previews.

## Recommended route/component ownership

Implement the storefront as `/cart`, `/checkout`, and a server-confirmed checkout result route; add `/account/orders` and `/account/orders/[id]`; expand the existing `/admin/orders` and add `/admin/orders/[id]` if the agreed API uses a separate detail route. These routes are a suggested UI map, subject to the backend contract. Keep the shared header/cart link and account shell in their existing owners.

Use server pages for session/capability checks and private initial reads. Keep client components narrow: cart quantity/removal controls, checkout address and validation interactions, payment-attempt feedback, customer order filters, and permitted staff actions. All private cart/order/admin reads must be uncached and owner/capability checked. A payment redirect or client success state must never imply that an order is paid; render confirmation only after fetching server-confirmed order/payment state.

Before wiring UI, agree typed contracts with the schema/API owner for cart read/update, server quote and checkout attempt, customer order list/detail, admin order list/detail, and each separately authorized fulfillment/cancellation/refund operation. Define bounded pagination, allowed filters/sorts, version/idempotency fields, status transitions, and machine-readable conflict/error cases. The server must re-read price and availability, compute integer-paise totals, validate address/shipping and the minimum, snapshot the order, and reserve stock atomically before any provider call. UI values are display/input only.

The current account-address API can inform the checkout address picker only after the backend owner confirms how an order snapshots the selected address and handles edits during checkout. Do not treat the saved address record itself as an immutable order snapshot.

## States and interaction requirements

Keep distinct loading, empty, recoverable error, unavailable, and access-denied states. For checkout, surface current-price changes, unavailable/insufficient stock, address validation, shipping/tax quote failures, and minimum-order failures beside the affected fields or totals; preserve entered values so a retry does not erase the form. Payment-pending needs a stable order reference and a clear “checking payment” state. Failure, cancellation, retry, late/unknown outcome, and duplicate submission must reflect server results and remain safe to refresh. Order history/detail should show only the signed-in owner’s records. Admin controls must appear only for the corresponding capability and server-allowed transition.

Use semantic forms and table/card headings, associated labels and inline errors, visible keyboard focus, keyboard-operable quantity/status controls, and polite live announcements for recalculated totals and async payment/order status. At narrow widths, reflow tables into labeled records without hiding focusable controls. Follow the app’s light/dark tokens and reduced-motion preference. Root owns localhost/browser verification; the design-preview render checks are not evidence of live-app verification.

## Decisions and coverage still missing

The exact ₹5,000 qualifying subtotal and boundary rule remain an owner decision; the selected checkout design only places the notice inside checkout and explicitly labels its examples as product-subtotal illustrations. Shipping regions/rates, GST/invoice rules, cart persistence for signed-out visitors, payment-provider/event ownership, reservation expiry and late-payment policy, cancellation/refund eligibility, fulfillment/tracking fields, and customer notifications also need approved contracts before corresponding UI claims or actions are added.

There is no selected standalone confirmation screen, customer order-detail screen, or separate admin detail screen. The admin preview has no real records or working transition panel. Reuse the approved visual language and design honest states, but do not claim those missing screens were reviewed or invent order counts, payment states, shipping estimates, tracking updates, or successful operations.
