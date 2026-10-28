# Corrected Razorpay test connection — 28 October 2026

The owner corrected the supplied test credentials. Their original signed-in Dashboard matches the corrected key ending **X4g**. The earlier capture belonged to the other account, whose key ended **GX5S**; it cannot be fetched with the corrected keys. No live configuration or storefront styling changed.

## Connection change and retained history

- InsForge's current Razorpay provider uses the Key ID as its account identifier. Changing it clears that environment's managed payment mirrors before catalog sync. This was inspected before configuration, not inferred from a successful checkout.
- Exact ownership checks found three old managed test orders: two journaled checkout fixtures and one cleaned connectivity probe. Other potentially cleared test tables were empty. Only these disposable mirrors were reset by the official test configuration operation.
- The two app-owned old order/attempt histories remain in `review`, with original quotes, totals and provider references preserved. Their test actors, fake stock, temporary identities/grants and carts were removed. The old provider originals were not deleted or paid again.
- New actors and attempts are scoped to an enrolled test Key ID. Prepare stamps that key before the provider call; binding cannot switch it. Runtime responses and verification reject a different key. A known provider-key mismatch freezes the attempt in review, and reviewed attempts cannot settle from later events. Previously exposed unscoped routines are now private.
- The existing InsForge test webhook was enabled in the matching Dashboard. Its HTTPS URL and signing secret were unchanged; all seven selected events and the unrelated disabled webhook were preserved. No duplicate endpoint was created.

The deployed raw-SQL parser rejected valid guarded statements before execution. Local parsing and an independent review confirmed the syntax; supported typed Admin operations retired only the exact fixtures, with version/ownership checks and complete readback before the credential change. A redacted parser report was submitted through the InsForge CLI skill. No managed schema was edited to bypass the configuration reset.

## Verified corrected-account flow

1. Fresh disposable Clerk actors and private fictional stock passed real API creation, replay, recovery, cancellation, absent-request closure, wrong-key and wrong-owner tests. Revoked unscoped routines were inaccessible. No duplicate provider order was created by replay/reload.
2. The browser completed the existing Buy Now checkout for **₹101.68**: ₹100 product, fictional ₹1.23 shipping and ₹0.45 tax. Reload recovered the same ready reference. Official Test Mode accepted a published test card; card storage was declined.
3. InsForge received genuine processed, non-live `payment.authorized`, `payment.captured` and `order.paid` events. The captured INR amount exactly matched 10168 paise. Managed order notes matched the enrolled key and the verified payment.
4. The app produced exactly one settlement, `paid` payment state, `processing` order state and a consumed fixture reservation. Fictional stock decreased once from five to four; Buy Now left the empty fixture cart unchanged. Reprocessing the stored genuine captured/order-paid events left the full app state unchanged. This is application idempotency evidence, not a provider-redelivery test.
5. Browser customer details and normal Admin showed the same paid order. A temporary fixture staff grant tested fulfillment/shipment synchronization, stale-version rejection (409) and non-admin denial (403), then was revoked. Admin browser readback showed fulfilled/paid with the fictional tracking details. The owner's Google/Admin session was restored.

## Cleanup and limits

The reconciled paid application fixture was removed by the existing checked cleanup, including its temporary identity/grants, fake stock, cart, application settlement and disposable order audit. The fresh provider-backed cancelled attempt is retained in review, with its actor/identity/fake stock removed. Together with the two earlier account histories, three app histories remain intentionally frozen for review. Final readback found zero test actors, zero fake stock and zero non-review attempts. Managed provider orders, transactions and webhook events remain as test history; no financial history is falsely reported as deleted.

The owned isolated preview on 3040 was stopped; the normal 3030 preview returns unavailable test capabilities, HTTP 503 for prepare and no Razorpay CSP hosts. Twenty-three focused checks, TypeScript and targeted ESLint passed. The earlier optimized-build/full-suite evidence remains separate; those were not repeated for this key correction. Real stock, GST/HSN, shipping policy, live payments and deployment remain outside this checkpoint. InsForge catalog sync still reports `failed` with `[object Object]`; successful checkout/webhook checks do not establish green catalog-sync health. Late capture after cancellation, changed-cart capture, actual provider redelivery/out-of-order delivery and refund execution were not exercised here. The earlier account's convenience-fee difference remains historical and was not generalized or used to weaken exact-amount checks.

Current evidence is recorded in [verification](verification/razorpay-test.json). Private screenshots and fixture journals remain ignored under `.bootstrap/`.

Subsequent [catalog-sync diagnosis](razorpay-catalog-sync.md) isolates the failure to Plans HTTP 401 while Orders/Items succeed. The existing webhook needs no further setup. The hosted formatter hides this provider denial; Test Mode Plans access remains an external gate.
