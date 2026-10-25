> Current authorization, 25 October 2026: proceed with the [Phase 6 non-commerce readiness audit](docs/phase-6-contract.md) after diagnostics commit `315c3c3`. Earlier dispatch exclusions are historical; full Phase 6 exit and Phase 7 remain gated. Keep commerce and live email deferred.

> Prior checkpoint: notification preparation is committed as `019a6e5`, after contact/Admin cleanup `602add9`. Continue bounded [application error diagnostics](docs/operational-diagnostics.md) with Luna xhigh workers, verification and a local commit. The owner keeps the Free InsForge plan; no real email, billing change, external monitoring or retention deletion. Checkout/payments remain deferred. Phase 6 and production deployment are not dispatched.

# PandaByte.in — phased delivery plan

Current bounded continuation, 26 October 2026: integrate 42 real-SKU archive products in development through the existing Admin APIs, reconcile all 44 including two missing-SKU holds, validate non-purchasable source observations and reviewed 2D galleries, verify a no-op rerun and browser/Admin flows, then commit locally. Preserve all archive/design/CAD artifacts. Production content review, operational commerce, recovery and deployment remain separate gates. See [the catalog integration contract](docs/catalog-source-integration.md).

Updated 24 October 2026, Asia/Calcutta. **Current checkpoint: Phase 4 is committed as 80c8685; Phase 5 commerce has started with an independent cart slice.** The existing store is a migration seed, not a limit on new products or content. The user authorized local Git commits and Luna xhigh implementation workers. Initialization is moved ahead of Phase 1 by this latest instruction; Phase 2 retains the remaining identity/data/shared-shell work. Each phase must pass checks and localhost built-in-browser testing for available features, have findings resolved, and receive a local commit before the next dependent phase starts. Development Clerk keys and InsForge CLI access are supplied; the authorized provider setup slice is recorded in [backend-setup.md](docs/backend-setup.md). The registered-user session and JWT identity round trip pass; customer/staff/private-storage checks and the shared frontend pass. Development publication/media models pass runtime verification; dependency remediation and Phase 4 are committed; Phase 5 is now authorized under [its contract](docs/phase-5-contract.md). Production operating policies remain commerce/release gates. No GitHub publication or production deployment is authorized. Read [README.md](README.md) for shared context, [design.md](design.md) for editable page contracts and [development-tooling.md](docs/development-tooling.md) for the researched toolkit.

## Review verdict and changes

Keep **Next.js App Router + TypeScript + Clerk + InsForge PostgreSQL/storage + custom business APIs**, with Vercel as the hosting direction. This is a coherent single-app architecture for company content and commerce. InsForge supplies data infrastructure; it does not automatically supply PandaByte's publishing, inventory, pricing or order workflows. Those are explicit implementation work. No second CMS, commerce platform, identity provider or search service is justified yet.

The earlier plan understated content operations and placed too much administration after storefront/checkout work. This revision brings administration and publication forward, separates drafts from public revisions, defines media/permissions, and adds measurable capacity gates. New products/categories/blogs/FAQs/team records must work beyond the original 44-item snapshot without routine code edits or deployments. AI agents may assist development; a customer-facing agent runtime remains future scope.

Confirmed design inputs now include Solutions → Learn → About → Contact, catalog-only search, visible Login and Clerk login before checkout. The UI chat owns visual refinements. Root planning coordinated with that chat and incorporates its user brief; actual chosen versions remain in [design-delivery.md](docs/design-delivery.md). Final hero polish does not have to block backend contracts once implementation is authorized. No design prototype proves backend behavior.

## Phase 0 — reviewed context and tooling (completed documentation baseline)

Deliverables: consolidated README with unchanged original audit appendix; revised design and phased plan; current agent instructions; dated tooling/license/adoption ledger. Preserve prior briefs, source evidence and ongoing design artifacts. Remove contradictory active instructions, not useful history.

Review work covers the actual current-site evidence, the two chats' requirements, official Next.js/Clerk/InsForge guidance and bounded GitHub research. Two Luna extra-high workers handle independent architecture/tooling research; root integrates. The main model follows the chat setting; no tool changed it.

Historical Phase 0 exit: local links/decisions/source preservation passed before app/Git/provider setup. Initialization, the verified Clerk–InsForge identity bridge and subsequent access checks are tracked separately in docs/phase-progress.md.

## Initialization checkpoint — before Phase 1

Create the single Next.js app, preserve existing context/design evidence, use a private package and local development branch, and prepare repeatable lint/typecheck/build commands. Test the development preview on localhost using the built-in app browser. Review findings, fix defects and commit this checkpoint before assigning dependent Phase 1 work. This does not complete Phase 2 identity/data integration. See [phase-progress.md](docs/phase-progress.md) for actual evidence.

## Phase 1 — contracts, operating decisions and design handoff

Status: independent preparation checkpoint produced and reviewed; the full exit gate remains held for the required owner/provider/design decisions. See [implementation contracts](docs/phase-1-contracts.md), [design handoff](docs/phase-1-design-handoff.md) and [phase progress](docs/phase-progress.md).

**Dependencies:** verified and committed initialization checkpoint; only resolve choices needed for the next slice. Owner keys/exports belong in protected configuration, never Markdown or prompts.

Frontend/design work:
- Reconcile actual chosen UI drafts with the route/block contract. Record exact versions for header/mobile menus, home/catalog/product, About/team, Contact/FAQs, blog/editor, admin and authenticated checkout.
- Agree editable block types and responsive states. Preserve the exact logo, current visual direction and neutral temporary team avatars in previews. Ordinary content edits are data; adding arbitrary component types remains development.
- Review Aceternity candidates for reusable text effects, buttons, cards and section accents against design.md. Record selected variants and static/reduced-motion behavior; keep catalog/checkout/admin interactions clear and lightweight.
- Define public route/slug ownership and legacy redirects, including solution overview pages versus purchasable hardware pages. Keep the future Agent software page informational/Coming soon.

Backend/contracts work:
- Agree product/variant/category fields, publication revisions, regular/sale price semantics and which records need translations only if selected. Define permissions and validation before parallel work.
- Choose Clerk sign-in methods and staging project; confirm InsForge staging, regions, limits and protected key handling. Decide the staff bootstrap procedure and user lifecycle behavior.
- Confirm shipping/tax/invoice and payment merchant requirements before commerce code depends on them. Login before checkout is already decided; guest checkout is excluded.
- Choose content approval roles, contact notification recipient/provider, upload limits/retention, real team content and migration exports. Define initial traffic expectations and budget before claiming capacity.

Exit: minimal written contracts for the next slice, a compatible visual handoff for components about to be built, and a testable identity/data integration approach. Backend foundations may proceed while unrelated visual polish continues; do not prematurely implement unapproved page appearance.

## Phase 2 — application, identity and data foundation

Current frontend scope: shared navbar/footer, persisted theme, guarded auth return paths and honest loading/error/not-found/unfinished-route states. The [frontend contract](docs/phase-2-frontend.md) and verification evidence record the checkpoint. This does not implement all selected screen bodies, shopping, admin editing or publication; Phase 3 is not dispatched by this commit.

Visual handoff: the owner selected [homepage v17](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) and the matching Superdesign layouts for each screen. The official CLI confirmed 39 drafts; use the [route-level screen inventory](docs/design-delivery.md) and [design contract](design.md). Fetch and record the current relevant version at implementation time. Selection does not turn simulated prototype actions into backend features or expand the production Agent scope.

**Dependencies:** implementation authorization and Phase 1 foundation decisions. Git/publication remain subject to the user's scope; do not assume a coding instruction permits publishing a repository.

Frontend:
- Extend the verified root-app Next.js/TypeScript initialization (checkpoint 8cf0769); do not rerun the initializer or recreate src/. Keep the pinned compatible versions and one package manager/lockfile. Add only selected Aceternity visual components, needed accessible shadcn primitives, Tailwind tokens and the selected Lucide icons (ISC). Use the Aceternity registry through the official shadcn CLI after the app exists; inspect generated source, compatibility, dependencies and component terms before accepting changes. Keep one shared component set and do not overwrite reviewed tokens.
- Build shared shell, accessible nested menus, theme, route error/loading/not-found boundaries, Clerk sign-in/account entry and an authorized staff shell. Public pages remain usable independently of private account data.
- Preserve cart and an allowlisted internal return path through login; no external redirect injection. Missing keys produce an explicit development setup state, never a fake authenticated session.

Backend:
- Link the explicitly selected staging backend, establish one migration owner and separate public media/private attachment storage. Record versioned migrations and reproducible seed/import strategy.
- Verify the official Clerk bridge: trusted signature/claims, text Clerk subject mapping, expiry/refresh, sign-out and cross-user isolation. Clerk owns identity; do not add InsForge Auth login. Resolve the token API against the pinned SDK; examples disagree on setter names.
- Put business roles in server-controlled data, validate every mutation/read boundary, add grants/RLS and owner-scoped queries. Keep administrative credentials server-only.
- Implement shared input/output contracts for catalog, content and operations. Public Server Components may call server services directly; do not add a self-HTTP roundtrip through a Route Handler without need.
- Set focused typecheck/lint/build and domain-test commands. Add CI once repository/CI scope is authorized. Configure structured error/request IDs and redacted logs.

Exit evidence: Clerk user A cannot access user B's records; signed-out users cannot reach private data; editor cannot grant roles or change inventory; expired/malformed tokens fail closed; anonymous access sees only published data; private files require authorization. Test the real browser → server → InsForge path in staging, not a decoded JWT mock alone.

References: [InsForge Clerk integration](https://insforge.dev/integrations/clerk), [Clerk protection guidance](https://clerk.com/docs/nextjs/guides/secure/protect-content), [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist).

## Phase 3 — editable administration and publishing

Status: Phase 3 is committed as `8ec7285`; the account extension is committed as `7d6938e`. The dependency gate subsequently passed and was committed as `be2fb66` with [compatibility limits](docs/dependency-remediation.md). See [Phase 3 verification](docs/verification/phase-3.json), [implementation contract](docs/phase-3-contract.md) and [data operations](docs/phase-3-operations.md). The owner's latest instruction resumes Phase 4 development. Production operating policies remain commerce/release gates.

**Dependencies:** working identity/RLS and agreed models. This phase establishes the data source before completing the public storefront.

Frontend/admin:
- Product and variant/SKU CRUD, categories/parent/order, specifications, compatibility, kit contents, resources, ordered image gallery and alt text; draft/publish/archive and useful list/search/filter states.
- Regular/sale price editing per SKU, sale windows, stock adjustments with reason and audit history. Cards derive savings; staff do not independently enter a conflicting percentage badge.
- Full blog/guide editor: title, slug, excerpt, cover, author, tags, structured rich body, SEO, draft, preview, publish/unpublish and revision restore. Phase 3 uses the bounded structured block editor already implemented; a Tiptap dependency is unnecessary for these controls. No commercial AI/collaboration feature assumed.
- Editable FAQ/topic/placement/order, business contact settings, About/company/solution/policy/home blocks, founder/cofounder/team records, and header/footer links within approved groups. Add owner-supplied YouTube entries and product-spec/resource references under Learn, using validated media IDs/URLs rather than arbitrary iframe HTML.
- Inquiry inbox with private detail, status and internal notes. Contact attachments remain deferred until their retention and accepted-file policy are selected. Show actual save/publish/permission/error states, unsaved-change warnings and revision conflicts.

Backend:
- Build validated CRUD and permission rules for every module, not a generic unrestricted table editor. Enforce unique SKU/slugs, valid category relationships, safe URLs and reference-aware archival.
- Separate editable drafts from immutable public revisions. Use optimistic version checks to prevent overwriting another editor. Build private/noindex preview and publication validation.
- Use the documented no-store public projections for immediate publication/withdrawal; add atomic retryable invalidation only if shared caching is introduced. Refresh affected listings/detail/navigation/SEO/search, record failures and retry; a silent cache failure is not completed publication.
- Validate media size/type/ownership and rich-content structure. Restrict embeds to approved providers; public rendering never executes arbitrary author-supplied scripts. Retain required image dimensions/alt text.
- Persist contact inquiries before returning a receipt. Notification failure leaves the inquiry available and retryable. Add idempotent submission handling, bounded input, rate limiting and private-file expiry/retention.
- Sale scheduling is baseline; coupon codes, stacking, per-user limits and scheduled article publication are additional policy choices. If selected, implement durable timing/redemption semantics and tests before presenting them as available.

Exit evidence: authorized staff creates a new product and category beyond the seed, changes prices, publishes a blog/FAQ/contact/team change, and sees public data update without deployment. An unpublished draft remains private, concurrent editors see a conflict, unpublish stops public exposure, a restored revision is auditable, slug changes redirect correctly, malicious rich text/upload is rejected, and a failed email cannot lose an inquiry. The prototype may show these flows, but acceptance uses real persisted staging records.

## Phase 4 — published storefront, discovery and company pages

Status: implemented and verified in development after dependency commit `be2fb66`. Bounded Luna xhigh workers used the frozen selected screen handoff; root applied and verified the development migrations, browser flows and clean integration run. See [the implementation contract](docs/phase-4-contract.md), [operations and limits](docs/phase-4-operations.md) and [verification](docs/verification/phase-4.json). This checkpoint is committed before Phase 5; checkout/payments and deployment remain outside this phase.

The account extension completed before this Phase 4 authorization: [dashboard/address contracts](docs/account-dashboard.md) and [verification](docs/verification/account-dashboard.json) cover Clerk identity/settings, the account dropdown, private contact phone and shipping/billing address book, auth returns and Agent presentation. Clerk phone verification is deferred, with contact phone stored unverified in the private profile.

**Dependencies:** publishable admin data and the corresponding approved design handoff.

Frontend:
- Render home/category/product cards/PDP from the same published catalog; add catalog search/filter/sort/pagination and exact SKU/model lookup. Keep search out of the navbar.
- Build About/team, Contact form, homepage/Help Center FAQs, solution/Coming soon pages, blog/guide listings/articles, Learn YouTube/resource pages and owner-approved policy/company content. No hard-coded fake teams/posts/reviews or fixed 44-product list.
- Use server-rendered content with small client interactions, responsive media, meaningful loading/error/empty states, keyboard controls, accessible forms and reduced motion. Delay third-party video loading until requested; give embeds accessible titles.
- Use metadata, canonical URLs, published-only sitemap and verified legacy redirects. Private/admin/preview content is excluded from indexing; noindex alone is not access control.

Backend:
- Implement exact normalized SKU/model matches ahead of indexed text relevance; retain important suffixes. Add bounded facets, allowlisted sort and stable tie-breakers. Never fetch the entire catalog to filter in the browser.
- Verify query plans/indexes against realistic catalog size. Consider pg_trgm only after extension availability and typo-relevance need are established; no embeddings/search service by default.
- Public product/category/page/nav/blog reads use `no-store` with request-scoped deduplication, so publication, withdrawal and operational price/stock changes appear on the next request. Introduce shared caches/tags only for a measured need. Account/admin/cart/checkout reads remain private. Revalidate live prices/stock at checkout.

Exit: create/edit/publish in admin drives the actual storefront; prices agree across cards/PDP; search handles SKU punctuation, combined filters, pagination and no results; unpublished content cannot leak through alternate routes/search/metadata; Contact persists and staff can process the inquiry. Verify 320/768/1024/1440px, light/dark, keyboard/focus, zoom and reduced motion. Record performance baselines before tuning.

## Phase 5 — authenticated commerce and operations

Latest instruction: checkout/payments are explicitly deferred; continue only the authorized non-commerce backend security and [role-based administration](docs/admin-roles.md). Owner `rajrabidas001@gmail.com` is the verified protected default ADMIN. Do not resume provider configuration or payment/order implementation merely because credentials become available.

Status: authorized and in progress after 80c8685. The private/guest cart checkpoint is implemented and verified; see [evidence](docs/verification/phase-5-cart.json). Full checkout/payment/operations gates remain pending test keys/webhook and merchant GST/shipping settings. See [contract](docs/phase-5-contract.md).

**Dependencies:** identity, catalog/pricing/inventory and merchant/business policies. Complete account and staff operational views with the domain services they use.

Frontend:
- Cart updates, sign-in-before-checkout, addresses, shipping/totals and clear price/availability changes. The owner removed the ₹5,000 minimum for Razorpay; omit the historical notice.
- Payment pending/success/failure/cancel/retry, order confirmation, own order history/detail and status. Success is server-confirmed, not inferred from a redirect.
- Staff order detail/history, fulfillment/tracking, permitted cancellation/refunds, inventory adjustments and support lookup; authentic review submission/moderation only under the selected eligibility policy. Preserve immutable order facts.

Backend:
- Re-read authoritative SKU prices/availability, compute integer-paise totals, validate quantities/address/shipping, snapshot order lines/prices/tax/address and reserve stock in an atomic transaction.
- Commit reservations before calling the provider. Evaluate the official InsForge Razorpay path against custom webhook/authorization needs; select exactly one event owner. No competing handlers update paid status.
- Verify signatures/provider state, enforce unique event/payment keys, accept duplicate/out-of-order delivery safely and reconcile unknown/late outcomes. Separate payment, order and fulfillment lifecycles.
- Use durable reservation expiry/retry/reconciliation and documented late-payment policy. Recheck price and eligibility before creating a new payment attempt. Prevent double fulfillment/refund and overselling; don't release stock twice.
- Enforce customer ownership and staff capabilities for every operation. Audit financial/stock/role changes. Persist retryable notification events separately from purchase success.

Exit: tests cover price/sale changes, multiple buyers on the last unit, failed/cancelled/retried payments, forged/duplicate/out-of-order events, expired reservations/late success, partial/provider-failed refunds where supported, and customer/staff denial. Complete test-mode purchase → verified payment → fulfillment → support/refund with actual staging data. Provider sandbox calls and load tests respect quotas; no real purchases during validation without explicit instruction.

## Phase 6 — migration, capacity and launch readiness

Status, 25 October 2026: authorized and in progress. The [non-commerce audit checkpoint](docs/phase-6-readiness.md) is implemented and verified after `315c3c3`; [evidence](docs/verification/phase-6-readiness.json) records the scoped checks. Content approval/import, representative capacity, isolated database/file restore and production operating decisions remain exit gates. Checkout/payments and live email remain deferred; this does not dispatch Phase 7.

After `eb2be19`, the owner resumed the remaining work: [original-byte media delivery and offline preflight](docs/phase-6-media-followup.md), renewed access checks and a [bounded capacity profile](docs/phase-6-capacity-profile.md). The owner confirmed 100 simultaneous visitors, mostly browsing; detailed workload/provider scope and measurements remain gates. RPO/RTO are undecided.

Latest decision: **restore is explicitly deferred**. Keep the runbook and open release gate; no backup/export/restore or recovery-target provisioning is part of this checkpoint.

- Reconcile source exports with actual variants, original media, rights and corrected technical claims. Fix the broken RGB Matrix route; do not import contradictions as verified specifications. Owner-approved new catalog content is valid beyond the audit snapshot.
- Dry-run idempotent imports; record row/error counts and rollback approach. Resolve whether/how old customers/orders migrate. Never invent transferable Wix passwords or expose private exports in Git.
- Review grants/RLS/private media, rich-content safety, input limits, staff bootstrap/revocation, webhook replay and logging. Check all public/private cache boundaries.
- Run relevant typecheck/lint/build, focused domain/integration tests and repeatable browser journeys. Audit keyboard/contrast/form states in both themes; automated accessibility tools supplement human checks.
- Agree and test the capacity profile below. Inspect database connections/query plans, host limits, storage/media bandwidth, Clerk quotas, rate limits and cost. Add infrastructure only for a demonstrated bottleneck.
- Verify database AND storage backup coverage with a restore rehearsal, deployment rollback, monitoring/alerts and operational recovery instructions. Select explicit recovery-time/data-loss objectives with the owner.
- Owner reviews legal/contact/tax/shipping/refund/privacy content and real team identity; temporary preview avatars/placeholder text are removed or expressly approved for publication.

Exit: recorded evidence for representative content/search/commerce/permission/restore/load scenarios; no unresolved critical defect; an operational runbook and realistic capacity/cost statement. “Production-ready” is an outcome of these checks, not a label granted by the chosen stack.

## Phase 7 — production release (separate instruction)

After explicit release authorization: configure production identities/data/media/payment secrets and domain, apply reviewed migrations, run verified import, validate current price/stock, configure real webhooks/reconciliation/notifications, deploy and run smoke checks. Confirm backup/monitoring and rollback ownership before cutover. Separate test/live credentials and preview/production environments. Do not assume GitHub publication, production provisioning or domain cutover is incidental to local development.

Exit: actual production purchase path and support operations verified under the approved payment procedure, healthy monitoring, rollback available and owner handover complete. Future AI/agent software, autonomous tools, LMS/forum, subscriptions and marketplaces need their own plan.

## Shared data and authorization contracts

These are conceptual records, not a migration already applied.

| Domain | Required invariants |
| --- | --- |
| Profiles/staff grants | Verified Clerk text subject; owner-scoped customer data; server-controlled capabilities; explicit bootstrap/revoke and audit |
| Products/variants/categories | Stable identifiers, unique SKUs/slugs, many-to-many assignments, valid parent graph, safe archive preserving references |
| Prices/discounts | INR integer paise; nonnegative prices, valid sale <= regular price, valid start/end times; authoritative current-price calculation and history |
| Inventory | Stock movements with reason, reservation states/expiry and constraints; concurrent updates cannot oversell |
| Content/publication | Draft + published revision, immutable revisions/version checks, validated structured fields, slug redirects, safe public projection |
| Company settings/team/FAQ/nav | Editable approved fields, placement/order/visibility, explicit publication; no fabricated identity/content |
| Media/video/resources | Public product media separate from private attachments, validated type/size/URL/provider, access and retention rules |
| Carts/orders/payments | Ownership, bounded quantities, immutable order snapshots, idempotency/event uniqueness, explicit state transitions |
| Inquiries/reviews/audit/jobs | Private submissions, moderated public reviews, financial/role/publication audit, durable failed-job visibility and retries |

Use database constraints for integrity and short transactions/locking for stock; application validation alone cannot prevent concurrent oversells. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) and [locking](https://www.postgresql.org/docs/current/explicit-locking.html). Keep InsForge's managed schemas intact unless its official integration requires a reviewed change.

Proposed roles: customer owns profile/addresses/orders; editor manages company/blog/FAQ/team content; catalog manager manages products/categories/pricing/media; operations processes orders/stock/support; administrator grants roles and controls settings. Restrict refunds and role grants to explicit capabilities; final allocation is a Phase 1 decision. An editor must not acquire commerce privileges by modifying profile metadata.

## Publication, cache and editing contract

A normal edit saves a draft; existing public pages keep the previous approved revision. Publish validates, commits a revision and schedules targeted refresh. Admin reads its committed changes immediately. Visitors receive the new public revision within a documented freshness target; failed refresh has observable retry. Unpublication and urgent withdrawal need tested immediate public exclusion/purge, not an indefinite stale response. Keep drafts, private previews and account data outside shared caches.

Select the caching API against the pinned Next.js version. Stale-while-revalidate is not a guarantee of immediate public freshness, and read-your-write APIs have context restrictions. Test actual multi-instance behavior and retry after interruption. Scheduled sale prices must remain authoritative even if a timer is late; cached display expiry is bounded by the next price transition. [Next.js revalidation](https://nextjs.org/docs/app/getting-started/revalidating).

This supplies automatic rendering/publication from authorized admin changes. It is not an unrestricted page builder or autonomous AI publisher. Safe rich editor/approved layout blocks are sufficient; a new component type or business rule is still code work.

## Performance and capacity acceptance

Proposed targets, not measured claims:
- Aim for p75 LCP <=2.5s, INP <=200ms and CLS <=0.1 on representative public routes, separated by mobile/desktop. Use lab baselines before launch and real-user measurement when traffic exists. [Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds).
- Establish a representative 10,000-SKU synthetic staging fixture. On 25 October the owner selected a target of 100 simultaneous visitors, mostly browsing; the [capacity profile](docs/phase-6-capacity-profile.md) separates that target from request throughput and real-browser coverage. Confirm request mix/rate, duration, devices, network, region and provider limits before load generation. These are planning test sizes, not measured production capacity.
- Proposed search API p95 <=500ms under the agreed workload with <1% unexpected server errors; measure cached and uncached paths separately and review query plans. Correctness and authorization errors are evaluated separately, not hidden by the error percentage.
- Test checkout concurrency with controlled provider stubs plus separate real sandbox integration cases. Never send an uncontrolled load test to Clerk/payment/production services. Set final peak checkout throughput, budget and acceptable latency once business traffic and service limits are known.
- Measure Aceternity/Motion client bundle and animation cost alongside editor/admin isolation, responsive image bytes, hydration cost and cold/warm response behavior. Verify static text, keyboard/touch and reduced-motion fallbacks for selected effects. Document limiting resources, scaling/cost triggers and recovery rather than saying “unlimited users.”

## Agent-assisted implementation workflow

Use the [tooling shortlist](docs/development-tooling.md), existing skills and official version-matched docs. No broad skill pack or duplicate MCP installation by default. Local and cloud agents need independently verified connections; local auth/browser/dev processes do not automatically follow a cloud task.

For each phase: read affected code/contracts → assign bounded Luna xhigh ownership → implement → run relevant checks → test available flows on localhost in the built-in app browser → root integration/review and fixes → record evidence → local commit → dispatch the next dependent phase. A failed check or missing required access stops the gate; do independent work only if it does not bypass that dependency. Two Luna xhigh workers are the user's preferred parallel configuration when supported. Root coordinates; one migration owner and one lockfile owner. Parallel frontend/backend edits begin only after shared contracts. Never let workers simultaneously edit shared components or production resources.

Use InsForge CLI/integration skills for staging/data, Next/React guidance for rendering, Ponytail for minimal complete changes, and verification/browser tools for real user flows. Preserve source licenses, separate credentials, inspect third-party registry code and apply least tool permissions. The future customer agent receives no tools, models, vector database or privileged API until separately scoped.

## Decisions still needed at their gates

- Foundation: Clerk methods/test keys, chosen staging projects, staff capabilities/bootstrap, traffic profile/region/budget.
- Content: exports/original assets, corrected specs, real team names/roles/bios, approved solution/software name and claims, YouTube videos/resources, review/publication policy and contact upload/retention rules.
- Commerce: merchant, shipping/GST/invoices, sale/coupon policy, return/refund/late-payment rules, notification provider and webhook/retry owner.
- Release: migration permissions, real-user analytics/consent choices, recovery objectives, verified capacity and explicit production instruction.

These do not block planning. Do not substitute fabricated records, permissive authorization or placeholder secrets when implementation reaches a required decision.
