# One-time product checkout — 28 October 2026

## Owner decision

PandaByte needs one-time product payments, not subscriptions. Do not enable Razorpay Plans/Subscriptions or require full managed catalog sync as a one-time checkout gate. Keep storefront layouts/styles unchanged and live payments disabled. This decision supersedes the earlier recommendation to request Test Mode Plans access merely to make catalog sync succeed.

## Existing supported path

The existing flow already uses server-priced **Orders → Razorpay Test Checkout → verified webhook → app order settlement**, through InsForge. It needs configured test credentials, scoped Clerk ownership/RLS, private fixture stock and the existing signed test webhook. It does not create provider Items or Plans, or call the managed catalog-sync endpoint.

An independent review of InsForge's official [provider configuration](https://github.com/InsForge/InsForge/blob/main/backend/src/services/payments/razorpay/config.service.ts), [order service](https://github.com/InsForge/InsForge/blob/main/backend/src/services/payments/razorpay/order.service.ts) and [webhook service](https://github.com/InsForge/InsForge/blob/main/backend/src/services/payments/razorpay/webhook.service.ts) found no full-sync/Plans health gate in those paths. No replacement provider client, database migration, application workaround or frontend change is needed.

The existing managed full sync still fails at Plans HTTP 401. Preserve that truthful status as a separate, out-of-scope subscriptions/catalog diagnostic; do not retry it as part of one-time checkout, rewrite health metadata or turn denied collections into empty successful results. Configuring changed provider keys can still trigger InsForge's own automatic full sync, so do not reset working credentials merely to repair that status.

## Validation contract

- The provider unit regression permits only `createOrder` and `verifyOrder`; unexpected Plans, subscription, catalog or sync access is recorded and fails the test, including if an internal catch swallows the error.
- Use one fresh disposable browser order while the stored full-sync status remains failed. Verify reload recovery uses the same order, genuine processed capture/order-paid events match the exact quoted amount, one settlement consumes fictional stock once, and customer/Admin views agree.
- Do not run the cancellation test again merely to create another unresolved provider-backed history. Preserve the existing three review histories and managed provider history. Clean the newly reconciled paid application fixture and temporary accounts/grants/stock.
- Restore the owner's Google/Admin session, stop only the owned isolated test preview, and verify regular app test capabilities remain unavailable. No live connection, real stock, GST/HSN or shipping policy is approved by this checkpoint.

Evidence is recorded in [the test verification file](verification/razorpay-test.json). The earlier [full-sync diagnosis](razorpay-catalog-sync.md) remains valid, but Plans access is not a prerequisite for this owner-selected flow.

## Fresh test results

The browser created one provider order for ₹101.68 and recovered that same reference after reload. A Clerk session interruption occurred before card submission; restoring the same fixture account and checking the saved UUID recovered the original order, without creating a replacement. A published fictional card completed Test Mode with storage declined. Genuine processed payment/order-paid events matched the exact INR amount, produced one settlement and consumed fictional stock once. Reprocessing the stored genuine events left app state unchanged.

Customer order API readback returned paid/processing at the exact total; a foreign customer received 404 and non-admin Admin access received 403. The owner's Google/Admin session was restored, and the normal Admin browser showed the same paid/processing order. Fresh customer-page visual coverage was interrupted by the development session change and is not claimed; its underlying API was verified. The session interruption's cause was not established and no speculative auth/UI change was made.

The stored full-sync account/status/error/timestamp fields stayed unchanged and failed throughout this successful payment. No Plans/subscription/full-sync operation was invoked by this test checkpoint, no subscription was enabled, and no live connection was configured. Twenty-four focused payment/API/contract checks and targeted ESLint passed; no application runtime source changed, so no new production build is claimed.

The reconciled paid app fixture, both disposable identities/grants and all temporary actors/fake stock were cleaned. Final readback has zero actors, fake stock, non-review attempts and app settlements; the three pre-existing review histories remain. Managed provider history is preserved (three test orders and six test events after the fresh capture). The owned isolated server is stopped; the normal preview still returns false capabilities and HTTP 503 for test prepare. [Fresh one-time evidence](verification/razorpay-one-time.json).
