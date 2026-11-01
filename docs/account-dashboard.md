# Customer dashboard and address book

The owner requested a signed-in navbar menu and customer dashboard using the local Unfiltered IITians repository as a layout reference, within PandaByte's existing theme. This is a specifically authorized account extension after Phase 3 commit `8ec7285`; it does not dispatch the remaining storefront or checkout phase.

## Account experience

- Dashboard: `/account`; Shop: `/shop`; Settings: `/account/settings`; Logout returns home.
- Clerk remains the identity authority for profile image, name and email. Settings embeds its supported account-management component. The owner subsequently deferred Clerk phone setup: phone support remains disabled, and the pending CLI login was canceled without granting access. The private customer profile now stores an optional editable `phone` contact field; it is explicitly unverified. An address contact number is also never a verified identity assertion. Clerk phone verification requires a later authorized integration.
- InsForge stores customer preferences, private files and the owner-only shipping/billing address book. Existing profile and private-file access remain available.
- One saved address may be both shipping and billing default, or those defaults can reference different addresses. Missing defaults are honest empty states. No order or payment history is invented.
- Home, company, contact, catalog and editorial routes remain public. Account, staff/admin, checkout and Agent enforce their own session/access requirements. Checkout and Agent remain honest unavailable states until their respective implementations are authorized.
- Bare authentication returns home. A validated same-origin intended path survives sign-in/sign-up; external destinations, duplicate return parameters and unsafe path forms are rejected.

## Address API and integrity

`GET /api/account/addresses` returns `{addresses}`. `POST` accepts the complete editable fields and returns `{address}` with status 201. `PATCH /api/account/addresses/{id}` also requires `expectedVersion`; `DELETE` requires only `expectedVersion`. All responses are private/no-store. Mutations require an active Clerk session, same-origin JSON and an 8 KiB streamed-body limit.

`GET /api/account/profile` includes the optional contact `phone`. PATCH accepts only the supplied `displayName` and/or `phone` fields, preserves omitted fields, supports clearing phone with an empty string and retains the existing 1 KiB streamed bound, same-origin requirement and owner RLS. Phone is at most 48 characters, trimmed and free of control characters. No verification or role fields are accepted. The dashboard shows the actual Clerk identity and edits only contact phone; the legacy store display-name preference remains API-compatible without introducing a second visible account name.

Editable fields: `label`, `recipientName`, `phone`, `line1`, `line2`, `city`, `state`, `postalCode`, `country`, `isDefaultShipping`, `isDefaultBilling`. The address response adds `id` and `version`. Country uses a two-letter uppercase code; postal codes remain text, preserving leading zeros. Phone is optional delivery contact data. Unknown identity, ownership and verification fields are rejected.

The `customer_addresses` table has owner-scoped SELECT RLS and no runtime direct writes. Narrow RPCs derive ownership from the trusted Clerk subject, validate again in PostgreSQL, serialize mutations per owner, enforce at most 20 addresses and unique shipping/billing defaults, and reject stale edits/deletes. Moving a default increments affected row versions. Staff capabilities do not grant access to another customer's address book.

Future checkout must revalidate its selected address and take an immutable order snapshot; it must not read a subsequently edited address as historical order data. Shipping regions, tax/GST details, verified-phone requirements and production address-retention rules remain checkout/operations decisions.

## Verification and recovery

Run the address validator and auth-return unit tests, lint/typecheck/build, auth/public-shell checks, and `tests/account-addresses-isolation.mjs` against localhost with the existing development environment. The isolation harness uses two disposable Clerk users and verifies API permissions, direct RLS/RPC boundaries, defaults, stale edits and concurrent address-cap enforcement. Its ignored fixture record supports explicit cleanup after interrupted testing.

Migration recovery is forward-only after application: disable the new UI/API if necessary, retain customer rows, export through an authorized operator, and repair with a new migration. Do not drop populated addresses as a rollback. Migration comments record the empty-development rollback boundary.

Browser checks and actual Clerk feature availability are recorded in the verification result at completion. Production deployment, payments, shipping/tax policy and real SMS delivery are separate checks.

Unknown paths retain the real not-found UI and `noindex`. In this build, the shared layout can stream before the route rejects an unknown path, leaving HTTP 200. This is [documented Next.js behavior](https://nextjs.org/docs/app/api-reference/file-conventions/not-found), not an invented valid page. The shell regression check verifies the not-found content and `noindex` for both streamed 200 and non-streamed 404. The experimental global-not-found trial did not affect catch-all rejection and was removed; no experimental routing flag remains. Review crawler/status requirements before production launch.
## Workspace shortcut stability — 1 November 2026

The account-menu access decision previously reset whenever either the navbar or menu remounted by pathname. It fetched only after opening, aborted when closed, and treated network/backend failures as a negative permission decision. This caused the Admin workspace link to appear late or vanish despite unchanged staff membership.

The navbar now retains its account subtree across public routes; mobile navigation, desktop dropdowns and the cart still reset on navigation. The access check is scoped to the active Clerk user **and session**, starts when that session mounts, deduplicates in-flight requests and rechecks on menu opening or window focus. Closing the panel no longer aborts that check. A ten-second timeout or invalid/failed response shows retry feedback and preserves only the same session's last confirmed decision. A real 401/403 removes the shortcut. New users/sessions start unknown and never inherit another session's decision. No browser-persistent role cache is used.

The shortcut is navigation only: Admin pages, APIs and InsForge permissions still authorize every request independently. A previously confirmed shortcut during a temporary refresh failure grants no access and cannot bypass revocation.

Verification: five focused regressions cover the real navbar lifecycle, quick close, transient failure/retry, malformed responses, grant/denial refresh and user/session switching with stale responses. The old source fails the prefetch regression. Built-in-browser checks on localhost:3000 confirm the owner's shortcut survives Shop → Home navigation, closes/reopens correctly with Escape, and produces no captured console errors. No role or account records were changed. This checkpoint is a source fix; it does not deploy or alter Agent/commerce configuration.
