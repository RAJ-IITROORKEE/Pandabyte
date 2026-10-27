# Checkout backend synchronization — 28 October 2026

The owner authorized backend/customer/Admin synchronization and a disposable development payment-bypass test, then explicitly approved functional storefront wiring while preserving layouts and styling. The bypass is an explicitly simulated payment, never a Razorpay capture. GST, shipping and verified stock decisions remain deferred. This supersedes historical prohibitions only for the bounded simulation; real commerce stays disabled.

## Existing architecture and gaps

Next.js APIs use active Clerk sessions and user-scoped InsForge clients. Profiles, versioned addresses, and signed-in carts already persist. Browser favorites and checkout drafts do not. The Orders ledger currently provides private Admin summaries only. It has no customer association, snapshots, payment attempts or fulfillment writer.

The simulation extends that ledger with customer ownership, immutable checkout snapshots, request idempotency and a versioned fulfillment state. It uses current published catalog prices and separate explicitly fictional fixture stock/charges. It does not infer operational stock, shipping or GST for the imported catalog.

## Contracts

- `POST /api/checkout/simulate`: strict contact/shipping/billing and item data, idempotency key, cart/Buy Now mode, expected cart version and reviewed subtotal. Server totals only; price changes conflict before mutation. Requires active Clerk, same origin, loopback development server, `PANDABYTE_COMMERCE_SIMULATION=true`, server-only `COMMERCE_SIMULATION_KEY`, matching database proof and a subject/variant fixture allowlist. No actor/stock grants are seeded by migrations.
- `GET /api/checkout/capabilities`: private actor/proof check before displaying fictional charges or an enabled simulation action. Fictional charges stay fixed during each fixture run.
- `GET /api/account/orders` and `/api/account/orders/[reference]`: owner-only, bounded, private/no-store.
- `GET/PATCH /api/admin/orders/[reference]`: `staff.manage`, expected version, validated fulfillment transitions and shipment metadata. Payment status cannot be edited.
- `GET/PUT /api/account/favorites`: owner-only versioned replacement of up to 50 product IDs; display metadata is derived from published products. Mandatory `x-account-owner` must match the active Clerk subject; this is a consistency guard, never an authentication mechanism. It prevents an old asynchronous merge/retry from writing under a newly active session.
- Real payment placement remains unavailable until its independent configuration/business gates pass. InsForge remains the sole Razorpay webhook owner; do not add a second receiver.

## Verification and release gates

Use disposable Clerk identities and actor-scoped simulation stock. Test authoritative prices, duplicate requests, changed payload reuse, insufficient/concurrent fixture stock, cart version and purchased-line removal, Buy Now cart preservation, customer isolation, Admin permissions, stale versions and fulfillment synchronization. Remove exact fixtures and revoke simulation grants after checks. Browser validation must distinguish visible UI checks from API-only tests.

Razorpay test/live were unconfigured at this checkpoint's read-only status check. Provider credentials belong in InsForge Payments configuration; webhook setup is manual through its public receiver. Real checkout also requires approved HSN/rates, tax inclusion, merchant/dispatch state, shipping rules, verified stock and reservation/late-payment/cancellation policies. No real charge, refund or production deployment is authorized by this simulation.

Relevant official references: [Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [webhook verification](https://razorpay.com/docs/webhooks/validate-test/), and the existing [provider boundary](phase-5-payment-review.md).

## Completed development checkpoint

Applied additive migrations `20261028110000_order-simulation.sql`, `20261028110001_favorites.sql` and `20261028110002_simulation-capability-bounds.sql`. The existing Admin ledger remains the single order authority. Customer lists/details and versioned Admin fulfillment use explicit safe snapshots and private responses. Cancellation releases only fixture stock, once; it does not restore or infer operational inventory.

Checkout now displays capability-gated fictional fees and creates a labeled simulation from the existing four-step interface. Account Orders displays snapshots and shipment updates. Signed-in favorites persist in InsForge; existing browser favorites merge once without dropping overflow or failed writes. The site shell, homepage hero and stylesheet design are preserved.

Pending simulation payloads remain in per-user memory. Only a non-personal request UUID is stored in session storage. Exact retries survive component remounts; after a full reload or sign-out, an uncertain request blocks new simulations and directs the user to Orders. Automatic reload reconciliation is not implemented. Never clear a pending marker merely to generate another request after an unknown outcome.

Validation: 256 unit checks plus four media checks, scoped ESLint, TypeScript and isolated production build passed. Two disposable-account integration runs passed authoritative price/rollback, idempotency, concurrent/insufficient fixture stock, Buy Now cart preservation, cart version/partial removal, customer isolation, Admin authorization/stale versions/transitions, once-only cancellation release, favorites ownership/version/RLS and expected-account guards. Fixtures and temporary grants were cleaned after each run.

Browser: real signed-in Buy Now created a fictional ₹301.68 order (₹300 captured catalog price + ₹1.23 fictional shipping + ₹0.45 fictional tax). Customer Orders and Admin showed matching snapshots; an Admin change to Processing and test shipment metadata appeared in the customer account. The browser order and temporary simulation actor/stock were removed afterward. The owner's real cart remained at ten items. New Admin detail checked at 320/768/1024/1440 CSS pixels, including light/dark. These are bounded browser/DOM checks, not physical-device, screen-reader, zoom, load or payment-provider tests. Private screenshots remain ignored under `.bootstrap/verification/`.

Next real-commerce gate: approved tax/shipping/stock decisions, configured Razorpay test mode and the documented single webhook owner, atomic operational reservations and provider reconciliation. None of these are completed by a simulated order. Related product Learn/video rendering remains coordinated with FRONTENT-UI; this checkpoint adds no storefront visual revision.
