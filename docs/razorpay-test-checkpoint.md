# Razorpay development test checkout — 28 October 2026

**Current update:** the owner corrected the keys, and the matching webhook and genuine paid checkout now pass. See [the corrected-account checkpoint](razorpay-test-key-correction.md) for current evidence and retained review histories. The first-account observations and external gates below are historical; their fee difference was not generalized.

## Authorized boundary

The owner supplied working Razorpay test credentials and authorized provider setup, disposable checkout testing and customer/Admin functional wiring, preserving storefront layout and styling. This supersedes the historical payment prohibition **only for the isolated test flow**. Live credentials, production deployment, real stock, real reservations, approved GST/HSN/shipping and real purchases remain out of scope.

Provider credentials are configured in InsForge's Razorpay connection, not application environment variables or Git. InsForge is the sole webhook receiver. No application webhook or second payment SDK was added.

## Implementation

- Server-only local-development endpoints require an active Clerk session, matching owner header, same-origin bounded JSON, an opt-in flag and a private proof matching an explicitly enrolled disposable actor.
- Private test stock and fictional charges are separate from operational inventory. The server quotes published prices and reserves only fixture quantities atomically.
- A UUID request key claims provider creation once. Replays and reloads recover the same attempt. Missing-attempt recovery closes that key; unknown provider outcomes never create another order automatically.
- Owner-level serialization prevents another payable attempt while an earlier one is unresolved, including provider-backed cancellation/failure. Closing the window does not prove the provider cannot report a late capture.
- Managed order insertion is constrained by owner, receipt, nonce, expected amount and a single creation slot. The temporary connectivity-proof policy is removed by the lifecycle migration.
- Callback verification checks app ownership before calling the managed verifier. A valid callback changes the app state to `verified`, never `paid`.
- Only processed, test, non-live captured/order-paid managed events with matching order, currency and amount may settle. Settlement is idempotent; cart quantities change only after capture and only if their reviewed version still matches. Buy Now does not remove the saved cart.
- Customer and Admin Orders accept explicit `TST-` references and show payment truth. Admin cannot mark a payment paid. The existing simulation remains separately fenced.
- The test window uses Razorpay's official script with the existing document nonce. Payment-specific CSP hosts are enabled only in opt-in development. Public page design/CSS is preserved.

## Verified so far

- A separate ₹1 connectivity probe created one genuine test provider order through Clerk and the managed SDK; disposable probe identities/grants were removed. Provider history remains intact.
- Real API testing created one provider-backed checkout order. Replay and recovery returned the same provider ID; anonymous/wrong-owner access was denied. Cancellation released fake stock once. Missing-attempt recovery fenced a delayed prepare. A new key after provider-backed cancellation was rejected by the owner guard.
- The browser completed all four existing checkout steps with a disposable Clerk test account, recovered the same ready order after reload, opened actual Razorpay Test Mode, declined card storage and received a valid provider callback. Customer Orders displayed that same order as pending/verified.
- Browser testing found and fixed Strict Mode initial-prepare abortion and stale aborted-recovery messages. Focused regressions cover these, duplicate modal opening, owner switching, uncertain results and callback/cancel races.
- TypeScript, targeted ESLint, 288 unit/media checks and an isolated optimized production build passed. These do not establish a completed capture/webhook/fulfillment flow.
- The owner's genuine Google/Admin session was restored. Admin Orders displayed the same test order with payment `verified`, and no fulfillment controls were offered before confirmed payment. No existing customer cart/content was changed by the fixture flow.
- The isolated opt-in server on port 3040 was stopped. The regular port 3030 preview remains running: its test capabilities return false, prepare returns 503 and its CSP does not allow Razorpay hosts. Unresolved fixtures are preserved for reconciliation rather than deleted.

## Historical first-account external gate

CLI follow-up: the official Razorpay CLI confirmed that the existing provider order is paid and its single test payment is captured. The base order is 101168 paise; the captured payment is 103192 paise, with a reported 2024-paise fee and zero tax. This is provider-side evidence only. See [the CLI verification and remaining setup boundary](razorpay-cli-verification.md). No new payment or application settlement was created by these reads.

The signed-in Dashboard showed a masked Test Key ID ending **X4g**, while the supplied working key ends **GX5S**. A new seven-event test webhook was created in that Dashboard, then disabled after the mismatch was discovered. Existing webhooks and all live settings were preserved. The owner agreed to switch to the matching account.

The callback is verified, but no Razorpay test event was found in InsForge's managed event ledger. The order therefore remains awaiting confirmation. Do not mark it paid, delete it, or create a replacement payment to hide the unknown outcome. Retain its ignored fixture journal for reconciliation and cleanup after the correct account/webhook is verified.

The account's existing convenience-fee configuration also added ₹20.24 to the ₹1,011.68 browser test total. No fee-bearer setting was changed: Razorpay documents that changes in Test Mode also apply to Live Mode. Exact amount validation remains fail-closed; customer-fee policy and payload reconciliation need verification before declaring this checkout complete.

InsForge's catalog sync still reports `failed` with the unhelpful `[object Object]` message, despite successful managed order creation and callback verification. Do not report overall provider health as green.

## Historical first-account resume and cleanup

1. Confirm the matching Dashboard's test key suffix without regenerating credentials. Register the generated InsForge test URL/signing secret there, avoiding duplicate endpoints. Select payment authorized/captured/failed, order paid and refund created/processed/failed.
2. Reconcile the existing provider order/payment and verified callback. Verify genuine event delivery and exact amount/fee semantics before changing application state. Never manufacture processed events as provider evidence.
3. Verify paid/failed/cancel/late/repeated events, customer isolation, Admin fulfillment and unchanged/changed-cart behavior with bounded disposable fixtures.
4. `tests/razorpay-test-integration.mjs --journal-browser` records only the two exact verified fixture subjects. `--cleanup` removes validated paid application test rows, fake stock/grants, carts/favorites and identities; it now refuses every nonpaid attempt, including cancelled/failed outcomes needing provider reconciliation. Managed payment/webhook/provider history is preserved.
5. Restore the owner's real Clerk Google/Admin session, stop the isolated opt-in server, verify normal purchases remain disabled, and update this checkpoint with observed results.

The proof and fixture journal live only under ignored `.bootstrap/`. Never copy credentials, proof, auth/session material or raw webhook/customer payloads into documentation, screenshots or Git.

## References

- [InsForge managed Razorpay order service](https://github.com/InsForge/InsForge/blob/main/backend/src/services/payments/razorpay/order.service.ts)
- [Razorpay test cards](https://razorpay.com/docs/payments/payments/test-card-details/)
- [Razorpay convenience fees](https://github.com/razorpay/markdown-docs/blob/master/payments/dashboard/account-settings/configuration/convenience-fees.md)
- [Clerk test emails](https://clerk.com/docs/guides/development/testing/test-emails-and-phones)
