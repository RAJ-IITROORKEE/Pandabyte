# Phase 5 payment integration review

Read-only review completed 24 October 2026. No Razorpay keys, webhooks, schedules, users, payment attempts, or deployments were created or changed. This is an integration recommendation, not a payment or legal approval.

**Owner decision after this review:** use Razorpay test mode and **remove the ₹5,000 minimum for Razorpay**. The earlier threshold calculation answer is superseded. There is no minimum to implement or request an exception for under the selected path. Test provider setup and product/merchant GST plus shipping configuration remain pending; see [Phase 5 contract](phase-5-contract.md).

## Current provider state

The linked InsForge development project is `988b987b-f809-4cd5-94b2-c1d1e5cc9120`. I ran the documented read-only Razorpay status command with `npx.cmd --no-install`; it returned successfully and reported both Razorpay `test` and `live` connections as `unconfigured`. It did not report that Payments is unavailable or that an upgrade is required. No Razorpay environment keys are present in the app’s `.env.local` key names. Do not put provider secrets in app env files or generic InsForge secrets: the CLI documentation directs them through InsForge Payments configuration.

To exercise the provider path, an administrator must configure **test** Key ID and Key Secret in InsForge Payments. Live keys and live-mode checkout remain outside this review. The Razorpay webhook is configured manually in Razorpay Dashboard using the HTTPS endpoint and separate webhook secret shown in InsForge Payments. The InsForge endpoint is public HTTPS, so webhook ingestion does not require deploying this Next.js app; Razorpay cannot deliver to `localhost`.

## Supported path and Clerk boundary

Use the InsForge Razorpay integration for one-time orders and Checkout.js. The official InsForge material documents server-side order creation, returned checkout options, signature verification, test/live environments, and webhook-driven fulfillment. The installed SDK posts Razorpay order creation and verification through its shared HTTP client; that client attaches the caller’s bearer token. InsForge’s Clerk guide says its API accepts Clerk JWTs natively when the Clerk template has `role: "authenticated"` and `aud: "insforge-api"`. The payment reference also says Razorpay runtime routes authorize using the caller’s InsForge token and require caller-specific RLS on `payments.razorpay_orders`.

**Conclusion:** the managed payment route is documented to work with the project’s external Clerk JWT model; no second InsForge Auth identity is needed. Before building checkout, prove this against the configured test connection with a signed-in disposable development customer. The current status has no keys, so the payment route itself has not yet been runtime-tested. Add the minimum RLS policy needed for an authenticated customer to insert only an order whose `subject_id` matches `requesting_user_id()` (the project’s Clerk text-subject helper). Some generic InsForge examples use `auth.uid()`; do not copy that into this project’s Clerk-owned policies.

## One event owner

Use **InsForge-managed Razorpay webhook ingestion** as the sole Razorpay webhook receiver. Configure the URL and webhook secret from InsForge Payments in Razorpay’s test dashboard. Do not also register a Next.js Razorpay webhook route. Let one app-owned, idempotent database transition consume verified `payments.webhook_events` rows and update the PandaByte order/payment ledger; use an outbox for email or fulfillment side effects. Use `payments.transactions` for reporting and provider references, not as order business state.

For payment success, accept only a processed `payment.captured` or `order.paid` event that matches the stored provider order, payment, INR amount, and PandaByte order. `payment.authorized` is not paid. Treat `payment.captured` and `order.paid` for the same payment as one settlement: deduplicate both webhook event IDs and provider payment IDs, lock the order during transition, and never let a late failure/authorization event roll back a captured payment. The browser Checkout callback may be verified server-side with `verifyOrder`, but it must leave the order pending until the webhook-confirmed transition arrives.

Razorpay requires a public webhook URL, signs the raw request body, may redeliver events, and warns that event delivery can be out of order. Its endpoint must return 2xx within five seconds; failed deliveries retry for up to 24 hours before Razorpay disables the webhook. Set the failure alert email and keep an operational replay/reconciliation procedure. The InsForge receiver should own signature verification and provider retry acknowledgement; app logic should consume its verified event ledger rather than verify or ingest the same provider event a second time.

## Order, reservation, and refund boundary

Before contacting Razorpay, an authenticated checkout API should call one atomic database operation that reloads current catalog prices and stock, validates the customer-owned address and quantity bounds, computes the amount in integer paise, snapshots line items/price/tax/shipping/address, creates an idempotent pending order and payment attempt, and reserves stock under row locks. Commit that reservation before the network call. Then create one Razorpay Order through the InsForge SDK in `test`, passing the server-computed INR amount and a short-lived internal order ID in `notes`; return only the checkout options needed by the browser. Keep provider credentials server-side. Never accept the client’s displayed amount, SKU price, subject, or stock as authority. Handle uncertain provider creation by reusing the persisted attempt and a documented provider lookup/idempotency strategy, not by blindly creating another chargeable order.

Make reservation release and stock conversion idempotent database transitions. A failed/canceled attempt may release once; a captured event converts the held reservation once. A captured payment after reservation expiry needs an explicit policy: reacquire stock atomically if available, otherwise hold for staff resolution or refund. Do not silently promise fulfillment after stock was released.

For reconciliation, periodically compare stale pending app attempts with InsForge’s verified event ledger and provider transaction records, and provide an audited staff path to investigate/replay unresolved events. The SDK inspected here exposes `createOrder` and `verifyOrder`, but no one-time order/payment fetch method; confirm a supported managed lookup/replay capability before choosing automated provider-state reconciliation. Avoid adding a second webhook receiver to compensate for this gap.

Refunds are permitted only for captured payments and may be full or partial. Persist an authorized, audited refund request with an idempotency key and enforce cumulative refunds not exceeding the captured amount. Track `refund.created`, `refund.processed`, and `refund.failed` separately; only the confirmed processed state is final. Razorpay documents refunds as returning funds to the customer’s original payment instrument; keep fulfillment history separate from the payment/refund state.

## Owner decisions and release gates

- **₹5,000 minimum:** Razorpay’s current Payments Terms, Part A clause 14.7(i), states: “You shall not impose any minimum or maximum transaction values for any goods or services sold to your customers.” The clause is a general merchant covenant in the payment-services terms; it is not written as card-only. Its precise scope for this merchant and the intended basis (basket, product, or another value) are not specified there. This conflicts with the current plan to enforce a ₹5,000 checkout minimum. Confirm applicability and any written exception with the Razorpay account contact before implementing the threshold; otherwise revise the requirement. Do not hide the rule only in the UI or split a sale to work around it.
- Threshold calculation is superseded by the owner's later removal of the minimum for Razorpay.
- Confirm shipping zones/rates, tax calculation and GST invoice details before order totals and immutable snapshots are defined.
- "Indian standard GST" does not identify each product's approved HSN/rate, price inclusion basis, merchant registration/dispatch state, or shipping policy. Keep these configurable inputs unfilled rather than assuming 18% or free delivery. [CBIC goods rates](https://cbic-gst.gov.in/gst-goods-services-rates.html) classify goods by tariff heading; [official invoice validation](https://einvoice6.gst.gov.in/content/kb/troubleshooting-common-errors/) distinguishes intra-state CGST/SGST from inter-state IGST.
- Decide reservation expiry, late captured-payment, cancellation, and partial-refund policies.
- For the first provider test, use a disposable development customer, test keys, Razorpay’s documented test instruments, and the InsForge-provided public test webhook URL. Verify payment creation, callback verification, delayed/duplicate/out-of-order webhook handling, and refund events before any live-mode discussion.

## Verification sources

- [InsForge Clerk authentication guide](https://insforge.dev/integrations/clerk) — external Clerk JWT claims and InsForge RLS.
- [InsForge Razorpay integration overview](https://insforge.dev/blog/insforge-razorpay-integration) — Orders, Checkout.js, signature verification, test/live setup, webhooks, and transaction visibility.
- Local `insforge` and `insforge-cli` Razorpay references — payment status, runtime authorization probes, RLS shape, manual webhook setup, and `payments.webhook_events` fulfillment model.
- [Razorpay Standard Checkout integration steps](https://razorpay.com/docs/payments/server-integration/python/integration-steps/) — create an Order server-side, use the provider order ID, and send amount in the smallest currency unit.
- [Razorpay webhook setup](https://razorpay.com/docs/webhooks/setup-edit-payments/) and [validation/testing](https://razorpay.com/docs/webhooks/validate-test/) — public URLs, separate webhook secret, raw-body signature, retries, duplicate delivery, and out-of-order events.
- [Razorpay Refunds API](https://razorpay.com/docs/api/refunds/) and [refund lifecycle](https://razorpay.com/docs/payments/refunds/) — captured-payment requirement, partial refunds, and final refund states.
- [Razorpay Payments Terms](https://razorpay.com/terms/) — Part A, clause 14.7; current page states effective 1 January 2026.
