# Simulated checkout recovery — 28 October 2026

The owner authorized fixing pending simulated orders after a reload, using subagents, disposable development data and browser validation. This is order-attempt reconciliation, not database backup/restore. Storefront layouts/styles and real-payment restrictions remain unchanged.

## Result contract

`POST /api/checkout/simulate/recover` accepts only `{idempotencyKey}`. It requires an active Clerk session, matching `x-account-owner`, same-origin JSON and a loopback development server. Responses are private/no-store.

- `created`: returns the owner's authoritative existing order, including its reference, total and original cart/Buy Now mode. It never creates or charges another order.
- `not_created`: atomically closes that owner/request key. Any original request arriving later is rejected with `attempt_closed`. The UI clears only the matching pending marker and offers Continue review; it does not automatically submit another order.
- Failure/unknown response: retains the marker, displays Check again, and blocks a new submission.

Creation and recovery share the exact existing per-owner/request advisory transaction lock. A new private `commerce_simulation_closed_requests` table stores only the opaque owner subject and request UUID. The previous creation RPC is renamed, revoked from runtime roles and called only by the guarded wrapper. Closed keys must not be deleted while an original request could still arrive; only explicitly disposable fixture keys are removed in these tests.

Existing orders and closed results can be checked after the fixture grant or simulation flag is removed. Closing a previously unseen key requires the authorized fixture actor and server proof. An owner lock enforces a 100-key closure bound; reaching it fails closed. Real payments, operational inventory and provider configuration are unaffected.

## Client behavior

Session storage continues to contain only a per-user request UUID, never checkout contact/address data. On reload, remount, mode or selection change, a pending marker triggers a result check rather than replaying the original submission. Account switches abort old checks; the expected-account header prevents an old request from using a newly active session. Stale checks cannot clear a newer marker.

Recovered cart orders refresh the current authoritative cart. Buy Now cleanup uses the original order's lines and preserves a different current selection. The existing UI theme/components are reused, with no stylesheet changes. Unknown results remain retryable without unlocking checkout.

## Migration and checks

Applied `20261028120000_simulation-recovery.sql` while simulation creation was disabled/quiescent. The wrapper must be installed before accepting new simulation traffic: an invocation already executing the old function body could otherwise bypass the new fence. The migration is additive/forward-only; removal requires a separately reviewed migration that preserves recorded keys/orders.

Verification includes request parsing, marker-only reload, account-switch/stale-response guards, repeated recovery, creation-first and closure-first outcomes, a concurrent create/recover race, denied unchecked-RPC/table access, proof/origin/owner guards, grant removal and the concurrent 99-to-100 closure limit. The test harness batches its cleanup queries to preserve API bounds. Focused and full regression results are recorded in [evidence](verification/simulation-recovery.json).

Browser validation used real development APIs and temporary source-only delays, removed before final checks:

1. The order committed while its acknowledgement was delayed. Reload automatically returned the same reference and ₹301.68 total. There remained one order and one fictional stock debit.
2. The submission was delayed before database creation. Reload returned No simulated order was created and Continue review; a durable closed key prevented the late request from creating an order. Continuing opened review without submitting another order.

Disposable order/audit records, test identities/grants, fixture stock, closed keys and journals were removed. The isolated simulation servers were stopped and their temporary proof removed. The owner's signed-in session and ten-item saved cart were preserved. Private browser screenshots remain ignored under `.bootstrap/verification/`.

No Razorpay charge/refund, real stock reservation, email, production deployment, load test or database recovery operation was performed. Physical devices, actual zoom, screen-reader speech and runtime reduced-motion switching were not tested in this bounded functional change.
