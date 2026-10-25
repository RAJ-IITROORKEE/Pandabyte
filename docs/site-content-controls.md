# Editable site controls and private review notes

26 October 2026. The owner authorized the three code follow-ups after content checklist commit `c84ea71`, using bounded Luna xhigh workers, testing and a local commit. Content publication, checkout/payments, load testing, deployment, live email/billing and recovery operations remain deferred. The existing logo, theme, layout and owner permissions are retained.

## Navigation

Edit `/admin/navigation`, fixed slug `primary`. A row matches an existing link by **location (`header`/`footer`) and exact destination**. Its label, position and visibility override the code default. Missing rows retain defaults; blank navigation settings or an unpublished/withdrawn record restore defaults. Lower positions sort first with stable default-order ties. To specify a complete order, supply overrides for every link in that group.

Top-level Solutions/Learn/About/Contact can be renamed, reordered and hidden. Their submenu structures remain fixed; hiding a parent hides its submenu and disclosure. Core submenu/footer links can be changed within their existing groups. The same destination repeated within one location shares an override. New visible header destinations join About; new footer destinations join Company & policies. Core targets remain stable: to replace a destination, hide the old one and add a validated new link in the supported addition group. Logo, account/authentication, cart, Agent action and theme controls are not CMS navigation entries.

The existing field/URL allowlist and 100-row bound remain. Duplicate `(group, href)` rows are rejected in both application and database validation. The public projection keeps visible rows and minimal hidden-state markers for known code-defined destinations only. A marker contains a generic label, core href, location, position and `visible: false`; private hidden labels and hidden custom URLs are omitted. `CORE_NAVIGATION_HREFS` and the SQL allowlist have a parity test. Adding a new code-defined destination requires reviewing the projection in a new migration; never edit applied migration history.

The public shell consumes these markers instead of filtering them out, so hidden core links do not reappear as fallbacks. Published-only/no-store reads and request-scoped deduplication remain; no shared cache or new invalidation system was added. The previously incorrect Solutions IoT Kits link now uses the actual `iot-kits` category slug.

## Support and brand copy

The Contact singleton (`/admin/contact`, slug `contact`) gains four optional plain-text fields:

| Field | Limit | Use |
| --- | ---: | --- |
| Support heading | 120 characters | Home support heading; explicitly supplied text also appears on Contact/private preview |
| Support description | 1,000 characters | Home support paragraph; explicitly supplied text also appears on Contact/private preview |
| Footer tagline | 160 characters | Footer brand description |
| Copyright name | 120 characters | Footer attribution; current year and copyright structure remain code |

Missing/blank values retain the existing Home/footer defaults. Contact and its private preview render only nonempty supplied support fields, without inventing a fallback claim. All values are ordinary React text, not HTML/Markdown execution. Existing contact documents remain valid; optional fields are not added to old drafts automatically. Contact details, office-address placement, exact logo and accurate development notice are unchanged. The footer reads the same published Contact record; failed settings reads fall back safely.

Migration `20261025233325_editable-site-copy.sql` was applied only to the linked development backend. It adds a narrow validation wrapper, duplicate-target guard and navigation projection update. It changes no content rows, roles, RLS policies or runtime grants. Helpers retain pinned search paths and no direct runtime execute permission. The earlier product/source-observation/resource validation and private `sourceReview` removal remain intact. Forward rollback requires a new reviewed migration restoring earlier function bodies after checking drafts for the optional fields; do not drop stored fields or reset the database. No production migration or restore is implied.

## Private source review notes

The existing `sourceReviewNotes()` formatter now includes allowlisted issue detail and readable held specification/compatibility/kit claims. It skips malformed optional values, omits unknown evidence/object fields and redacts recognizable URLs, paths, UUIDs and hashes. Notes retain the 64-entry/2,000-character caps. This is a presentation safeguard, not a universal secret scrubber.

No importer apply/rerun, product edit or note backfill was performed. Existing product notes and Admin edits remain untouched. The improved formatter is available for future explicitly authorized integration/review work; it does not make source claims approved or public. Importer idempotency/version guards are unchanged. Database public projection and the typed public parser continue excluding/rejecting `sourceReview`.

## Verification and limits

- Final lint, typecheck and production build pass; all 125 unit tests pass. Seven auth HTTP, three shell HTTP and two security HTTP tests pass. No dependency or lockfile change was needed; the package script only adds the new helper test.
- `tests/site-settings-db.sql` passed as a read-only CLI function check: old/new contact documents, exact limits and bad types/control characters, duplicate navigation targets, safe hidden-core markers, hidden-custom exclusion, review-note exclusion and helper permissions. It publishes/writes no content.
- The built-in browser saved and reloaded two disposable unpublished drafts through the genuine owner's Admin session. Four copy fields persisted; a partial Contact preview did not manufacture a missing support paragraph. Navigation rename/position/hidden values persisted; duplicate targets focused a human validation alert. Anonymous detail APIs returned 404 for both drafts; the public homepage retained default text.
- Sixteen browser cases cover Contact fields and public navigation at 320/768/1024/1440 in light/dark with no document overflow. Default menu opening, arrow-key focus, Escape return and corrected IoT Kits destination pass. The owner session remains; viewport overrides are reset and catalog remains open. No observed application console errors.
- The built-in browser stalled on the native Archive confirmation. Cleanup instead used the existing version-guarded Admin API, then an exact ID/title/creator/never-published guard removed only the two owned disposable record rows. Their audit events were preserved. No real content, user, role, file or imported product was changed. No published revision was created.

See [verification](verification/site-content-controls.json). Custom published settings were tested through pure resolution/typed projection and real database helper checks, **not** a live publish/withdraw cycle: publication is explicitly deferred. Full publishing/storefront mutation suites were intentionally not run. Source facts/rights, actual company copy, production configuration, screen-reader/capacity/recovery and release gates remain open.
