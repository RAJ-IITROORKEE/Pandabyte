# One-time cancellation, failure and duplicate tests — 28 October 2026

The owner authorized isolated disposable Test Mode checks, browser validation and cleanup, preserving frontend design and keeping live payments disabled. This supersedes the prior checkpoint's instruction not to repeat cancellation merely for more coverage. No Plans, subscriptions, provider configuration, operational stock, GST/shipping inference or deployment was added.

**Cancellation and duplicate webhook handling passed. Genuine failed payment followed by Razorpay's same-order Retry remains unverified.** Do not report the full failure/retry matrix as passed.

## Verified

- Browser checkout prepared ₹101.68 (₹100 source price, explicitly fictional ₹1.23 shipping/₹0.45 tax), confirmed exit and recovered the same cancelled order after reload. Two more cancel calls left the attempt/order/cart unchanged; repeated recovery preserved its reference/provider order. Fake stock returned to five once, with no settlement. Same-key preparation replayed the existing result without provider creation; a new key was rejected by the user-scoped database guard as `attempt_pending`, without risking another provider order.
- A second fixture's Test Mode Canara payment automatically succeeded without exposing mock Success/Failure controls. Its next order offered UPI QR only, then a published fictional debit card with storage declined remained at Sending OTP before also succeeding without an OTP/failure input. Both genuine captures matched processed capture/order-paid events at ₹101.68, each settled once, and fake stock moved five → four → three. The customer Orders browser showed both paid/processing orders. Customer API matched; foreign customer404 and non-admin Admin detail403 passed.
- Official InsForge CLI readback independently verified the newest order's genuine event IDs, payment/order identity, exact INR amount and captured/paid state. Two concurrent capture duplicates plus one order-paid duplicate returned200 with `received:true, handled:false`; an invalid signature returned400. Both orders' application snapshots, stock, cart, settlements and audits stayed unchanged. Independent CLI comparison also found unchanged managed event count, attempt counts, payloads and processed timestamps.

Webhook replay means **locally re-signed reserialization of genuine stored JSONB payloads using their original event IDs**. It is not original wire-byte replay or Razorpay-origin redelivery. No genuine failed event existed, so failed-event replay was skipped.

## Fix and limits

A local mock-modal regression reproduced a stale failure alert after a later successful callback. Two functional lines now clear the alert on success and ignore later failure callbacks after success verification starts. Server verification stays authoritative; no markup, CSS, layout or design changed. The regression failed before the fix, then passed. This proves client event handling, not genuine backend failed settlement/provider Retry.

Bounded Terra workers and Sol high review found no blocking issue. All 25 focused payment/API/contract tests, targeted ESLint and TypeScript passed. No new production build or viewport/theme sweep is claimed.

Razorpay documents failure/success UPI IDs and short-OTP card failure, but the necessary inputs were unavailable in this run. No fabricated failure was sent to the managed webhook and no undocumented collection endpoint was called. [Official UPI tests](https://razorpay.com/docs/payments/payments/test-upi-details/), [official card tests](https://razorpay.com/docs/payments/payments/test-card-details/).

## Cleanup and remaining gates

The cancelled provider order can still receive a late result, so its app history is frozen in review and its test actor revoked before deleting its disposable identity/grants/fake stock. Both reconciled paid app fixtures and the other identity were removed by guarded cleanup. Provider history is intentionally retained.

Final counts: zero actors, fake stock, non-review attempts and app settlements; four review histories (three existing plus this cancellation), six managed test orders and12 events. Owner Google/Admin was restored; the normal browser showed the retained cancelled/payment-review detail after refresh. Only the owned3040 preview was stopped. Normal3030 capabilities remain false and prepare503; live is unconfigured. The unrelated full-sync diagnostic remains failed and unchanged.

Remaining gates: genuine `payment.failed` stock release, same-provider-order Retry/capture, failed-event replay after paid, and provider-origin redelivery. [Evidence](verification/razorpay-failure-retry.json); screenshots/private journals remain ignored under `.bootstrap/`.
