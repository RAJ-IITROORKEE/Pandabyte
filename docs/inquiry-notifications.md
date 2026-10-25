# Inquiry notification preparation

25 October 2026. The owner chose InsForge email if supported, then explicitly chose **keep the Free project and prepare notifications only** after the plan check. The owner supplied a temporary personal test recipient in ignored configuration; replace it with the official support inbox later. No billing change, real email, deployment or scheduler is authorized by this checkpoint. Checkout/payments remain deferred.

## Bounded delivery contract

Reuse the existing private one-row-per-inquiry `inquiry_notifications` outbox. Inquiry creation and its outbox insert remain atomic and idempotent. Add an independent optimistic notification version, bounded attempt count (maximum five), lease token/deadline and safe timestamps. States: `unconfigured` (not attempted), `leased`, `sending`, `accepted`, `failed`, `uncertain`, `suppressed`. No provider raw error, secret, message ID or lease token is returned to the browser.

Staff-triggered sending is the initial processor; no background scheduling or new service is added. Existing `inquiries.manage` authorization and same-origin bounded JSON remain mandatory. A separate random server-only `INQUIRY_NOTIFICATION_KEY` is checked against a hash in private database configuration. It is not the contact submission key or a full-access backend key.

RPCs (root owns migration):

- `admin_claim_inquiry_notification(p_id uuid,p_expected_version bigint,p_dispatch_key text)` checks staff capability plus proof, locks inquiry then notification, refuses spam/terminal/in-flight/uncertain/max-attempt states, and returns `{token:uuid}` after a two-minute lease. An expired pre-send lease can be reclaimed safely; a `sending` lease is never requeued.
- `begin_inquiry_notification(p_id uuid,p_token uuid,p_dispatch_key text)` rechecks staff capability, proof, valid unexpired lease and spam before crossing into `sending`, increments attempts/version, and gives the sending phase a two-minute deadline. Returns boolean; false means suppressed without transport. Completion can still persist an already-started result after role revocation.
- `finish_inquiry_notification(p_id uuid,p_token uuid,p_outcome text,p_dispatch_key text)` checks proof and the matching sending token, accepts only `accepted`, `failed`, `uncertain`, or `suppressed`, and writes status/version/timestamps. No arbitrary provider diagnostics are stored. Matching late completion can settle its existing attempt; it never starts another one.

`inquiry_dto` adds `notification: {status,version,attempts,lastAttemptAt,acceptedAt}` and keeps `notificationStatus` for existing callers. An expired pre-send lease is shown as ready; an expired `sending` phase is shown as `uncertain` and cannot be retried. Status changes to spam atomically suppress unstarted/failed/leased notifications. An already started external request cannot be recalled. Send/retry requests append a staff audit note; existing customer/inquiry versions and role checks remain intact.

## App and UI contract

Root helper `lib/contact/notifications.ts` exports `notificationSettings(env)`, `parseNotificationRequest(value)` and `dispatchInquiryNotification(database,id,expectedVersion,key,send)`. `database` is the InsForge database client; `send` is an injected function returning `{data,error}`. The helper returns `accepted|failed|uncertain|suppressed`. Tests inject a fake sender directly; there is no fake mode in the running app.

`POST /api/admin/inquiries/[id]/notification` accepts only `{expectedVersion}`. It checks capability, origin, body bounds, configuration, then claims/begins/sends/finishes once. Success returns `{inquiry,notificationAvailable}`; a known provider failure is a persisted `failed` result, not loss of the inquiry. Unknown provider/network failures are `uncertain` with no retry. Stale/concurrent/terminal requests fail with 409; disabled configuration returns 503 before claim or send.

Admin inquiry GET/PATCH responses include `notificationAvailable:boolean` alongside their existing result. Live configuration requires explicit `INQUIRY_EMAIL_ENABLED=true`, a bounded single `INQUIRY_EMAIL_TO`, and the scoped key. It remains disabled locally under the owner's Free-plan decision. The future sender uses the existing Clerk-scoped InsForge server client; no project-admin key is added to the app. Live entitlement, Clerk-token compatibility, recipient handling and acceptance must be verified before enabling it.

The minimal detail UI shows a human email status, optional attempt/time information and a Send email/Retry email button only for unconfigured or definitively failed states below five attempts. Setup-disabled, sending, accepted, uncertain, spam and suppressed states never offer an actionable retry. Refresh status preserves staff form drafts. Stale detail responses cannot overwrite a newer selection. No raw IDs or provider errors appear.

Email/list refreshes update only notification fields of an open inquiry; they do not silently advance its saved edit version. A concurrent staff edit therefore still causes a save conflict, preserving the draft for review. [Verification evidence](verification/inquiry-notifications.json) records the development checks and simulated-send boundary.

## Provider and release limits

The linked project reports Free. InsForge's email skill/feature announcement says custom email needs paid access; newer Messaging docs omit that gate. No real send is used to probe entitlement. Current SDK/send API does not document an idempotency key or a complete app-facing delivery-event contract. API success means **accepted by email service**, not delivered. Only definite pre-acceptance authorization/rate rejection can be retried; ambiguous errors/crashes cannot be blindly resent. Notification email contains only a generic Admin alert, with no customer message, email, phone, record ID or executable user HTML.

Provider references: [Messaging](https://docs.insforge.dev/core-concepts/messaging/overview), [TypeScript email](https://docs.insforge.dev/sdks/typescript/email), [published email API](https://raw.githubusercontent.com/InsForge/InsForge/main/openapi/email.yaml), [email announcement](https://insforge.dev/blog/insforge-email-service).

## Recovery and enablement gates

The migration is development-only and additive to existing inquiry records. Recovery uses a reviewed forward repair; never reset/delete genuine inquiries or regrant the legacy public RPC. Rotate the scoped dispatch secret and private hash together; a mismatch fails closed. Restore/rollback rehearsal is not performed here.

An ambiguous dead send remains terminal for automatic/manual resend. Before live enablement, establish the provider's delivery-event correlation and an explicit reconciliation procedure; do not clear `uncertain` to make a retry button appear. No exactly-once or inbox-delivery guarantee is claimed. Automatic scheduling and a noninteractive sender identity require separate verified contracts; this checkpoint only prepares staff-triggered processing. Verify paid entitlement, the Clerk-token email call, fixed recipient, sender and actual acceptance before setting `INQUIRY_EMAIL_ENABLED=true`.

Also verify the provider's direct email endpoint permissions: its SDK guide permits authenticated callers, while this app permits only staff. App-level capability checks do not restrict a separately reachable vendor API. Confirm that ordinary Clerk customer tokens cannot bypass recipient/rate policy at that endpoint, or obtain a supported server-only restriction before enabling paid email. No managed-schema or vendor-auth policy is changed here.
