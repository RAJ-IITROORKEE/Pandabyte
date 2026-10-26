> Public frontend checkpoint, 27 October 2026: [storefront refactor](docs/storefront-refactor.md) introduces Products/Solutions/Shop/Company navigation, morphing product previews, mobile filters and a cart drawer. The original interactive hero and global theme remain unchanged. Admin is separate and untouched by this checkpoint. Existing source observations remain non-purchasable; checkout/payment placement and production deployment remain deferred.

> Latest correction, 27 October 2026: owner-approved captured source prices are editable/importable in Admin as required Set/Actual pairs; source observations remain non-purchasable and publicly price-masked. Global product/category/price statistics are added. Earlier source-price restrictions below are historical. See [current contract](docs/admin-product-prices.md).

> Latest 3D checkpoint, 26 October 2026: the owner authorized development-only interactive image/model galleries and Admin media controls. Eighteen optimized visual models are attached: 12 storefront previews and six private vendor-derived models pending redistribution permission. Download controls are omitted; interactive browser data remains extractable. Source observations stay non-purchasable. See [the 3D contract and evidence](docs/product-3d-integration.md). Production deployment and commerce remain deferred.

> Latest checkpoint, 26 October 2026: [Phase 6 operational-readiness documentation](docs/phase-6-operational-readiness.md) consolidates environment names, incident procedures and open owner decisions after `1ed5c23`, reviewed with Luna xhigh workers and verified offline. No service/configuration changes or private configuration reads. Content publication, checkout/payments, load tests, deployment, live email/billing and recovery operations remain deferred. Production readiness and full Phase 6 exit remain unproven.

> Current authorization, 25 October 2026: Phase 6 non-commerce readiness is resumed after `315c3c3`; see [its contract](docs/phase-6-contract.md). Historical Phase 6 exclusions below are superseded. Checkout/payments, real email and production deployment remain deferred.

> Current follow-up after readiness commit `eb2be19`: [media delivery and offline preflight](docs/phase-6-media-followup.md), current access checks and [100-visitor capacity planning](docs/phase-6-capacity-profile.md). Recovery objectives remain undecided. The source archive is being updated separately; use the new preflight's exact snapshot instead of treating earlier audit counts as current approval.

> Current catalog checkpoint, 26 October 2026: the owner authorized development-only integration of 42 SKU-bearing source products with dated source-price observations and reviewed 2D galleries. Two missing-SKU products remain outside CMS. Source observations are explicitly non-purchasable; operational prices/stock remain unset. See the [integration contract](docs/catalog-source-integration.md). Owner factual/production publication review remains pending; preserve the archive and other-chat artifacts.

> The owner explicitly deferred restore testing during this follow-up. No backup/export/restore or recovery-target provisioning is performed; recovery remains a release gate.

# PandaByte.in — single project context

27 October Categories/chart checkpoint: the isolated Mono Admin adds server-side category search/filter/sort/pagination, parent/product counts, versioned edit feedback and confirmed safe archival. Product statistics use Admin-scoped shadcn/Recharts visualizations with real counts/prices. Public frontend and real records remain unchanged. [Contract](docs/admin-categories-charts.md) · [verification](docs/verification/admin-categories-charts.json).

27 October product administration checkpoint: pricing now belongs to product add/edit; the standalone Pricing page redirects to Products. The Mono product table adds scoped search/filter/sort/pagination, image previews, concise metadata and confirmed archival. The editor adds safe slug generation, five-image uploads, tags, structured rich text, separate supported-layout DOCX previews and retained 3D controls. Development API/schema changes preserve capability, version, private-media and source-observation boundaries. [Contract](docs/admin-products.md) · [verification](docs/verification/admin-products.json).

27 October Admin UI checkpoint: the owner selected a separate Kiranism Mono Admin interface with Geist Mono, Tabler icons and independent appearance controls. The public storefront keeps its logo, hero and existing styling. Existing Clerk/InsForge permissions and data flows remain authoritative; workspace/chat/AI/notification additions are upcoming previews. See [the Admin migration contract](docs/admin-mono-migration.md) and [verification](docs/verification/admin-mono.json).

26 October accessibility follow-up after `91109c5`: [form focus/live semantics, preview headings, circuit feedback and narrow file-input fixes](docs/phase-6-accessibility-followup.md) pass bounded development checks. Actual browser zoom, reduced-motion preference switching and real screen-reader speech remain manual gates. No content was published or real customer data changed; commerce, load tests, recovery operations and deployment remain deferred.

26 October code follow-up after `c84ea71`: [editable navigation, support/brand copy and private review-note formatting](docs/site-content-controls.md) are implemented and development-tested. Only disposable unpublished drafts were used; content publication and note backfill remain deferred. Checkout/payments, load tests, recovery operations and deployment remain deferred.

26 October content review after `4a71e23`: the [content-gap checklist](docs/content-gap-checklist.md) separates owner factual/rights/company-copy decisions from existing Admin entry tasks and three concrete code-editability/review-note gaps. Anonymous published counts and 15 completed browser routes were reviewed; no content was changed or approved. Checkout/payments, load tests, recovery operations and deployment remain deferred.

26 October continuation: the populated-site [Phase 6 performance/accessibility review](docs/phase-6-populated-review.md) adds bounded image previews, URL-consistent filters and keyboard/contrast fixes. Original media and publication/privacy gates remain intact. Sequential measurements are not load tests or Web Vitals; checkout/payments, recovery and deployment stay deferred.

Updated 24 October 2026, Asia/Calcutta. **Current checkpoint: Phase 4 is committed as `80c8685`; Phase 5 guest/private carts are implemented and verified, with checkout/payment operations explicitly deferred.** See [cart evidence and remaining gates](docs/verification/phase-5-cart.json). This file consolidates decisions, architecture, source findings and the complete original audit. Shared frontend contracts are recorded in [Phase 2 frontend](docs/phase-2-frontend.md); current publishing contracts are in [Phase 3](docs/phase-3-contract.md), [admin frontend](docs/phase-3-frontend.md) and [data operations](docs/phase-3-operations.md). Phase 4 [operations](docs/phase-4-operations.md) and [verification](docs/verification/phase-4.json) record the storefront, search and remaining release limits. Read it first; [design.md](design.md) specifies page/content behavior, [plan.md](plan.md) defines implementation phases, and [AGENTS.md](AGENTS.md) governs agent work.

## Local development

Use Node.js 24 and npm 11.16.0. Install locked dependencies with npm ci; run npm run dev and open http://localhost:3000 in the built-in app browser. Run npm run check for lint, route/type checks and production build. Routes live in root app/ (no src/); the @/* alias points to the repository root. The published storefront and company pages consume admin-managed records. Checkout and payment operations remain Phase 5 work.

Copy .env.example to ignored .env.local when the owner supplies the selected test/staging credentials. Clerk entry points and the server account gate are implemented; the existing InsForge project is linked and a read-only database probe passed. Registered Google login and the real Clerk-token-to-InsForge identity round trip now pass; Customer profile RLS, staff grant/revoke checks and private storage now pass live API/SDK and built-in-browser verification. See [Phase 2 access contracts](docs/phase-2-access.md). See [backend setup](docs/backend-setup.md) and [skills selection](docs/skills-selection.md). [Phase evidence](docs/phase-progress.md) records completed checks, pending gates and commits. [Project-local ECC skills](docs/ecc-skills.md) are installed for API/security/migration guidance with project-specific overrides.

## 1. Latest decisions and authorization

- The application diagnostics checkpoint is committed as `315c3c3`. It adds [application error diagnostics](docs/operational-diagnostics.md): closed server-event fields, response-only error references and Next's uncaught-error hook. References stay out of visible UI and response bodies. It adds no external monitoring, data retention/deletion, billing changes, live email or deployment; provider/framework logs and production alert/retention policies remain separate gates. Notification preparation is committed as `019a6e5`.

- 25 October: the owner authorized [inquiry notification preparation](docs/inquiry-notifications.md), selected InsForge if supported, supplied a temporary test recipient privately, then chose **keep the Free plan; prepare only**. Real email stays disabled. The checkpoint adds durable status, staff controls and bounded retry/unknown-outcome handling; no provider delivery, billing change, scheduler, Phase 6 or deployment is implied. Contact protection/Admin identity cleanup is committed as `602add9`.

- 25 October: [strict nonce CSP](docs/csp-hardening.md) is verified with the real signed-in owner account/Admin and production HTTP checks. [Evidence](docs/verification/csp-hardening.json). Landing v26 is committed as dcce07e; checkout/payments remain deferred.

- The latest landing-page selection is [Superdesign homepage v26](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba), superseding the older frozen homepage version for this update. [Implementation and data boundaries](docs/landing-v26.md). The owner requests this frontend gate first, then continuation of authorized non-commerce hardening; checkout/payments remain deferred.

- Latest instruction explicitly defers checkout/payments and authorizes the remaining non-commerce backend security and role-based administration. The uniquely verified Clerk identity for `rajrabidas001@gmail.com` is now the protected default ADMIN; runtime authorization uses its opaque subject and database grants, never an email bypass. This supersedes the earlier normal-customer requirement. [Role contract and security scope](docs/admin-roles.md).

- Role-based administration and the scoped hardening checkpoint are implemented and verified; see [evidence](docs/verification/admin-roles.json) and [remaining security/release gates](docs/security-readiness.md). Admin roles do not grant access to customer-private records. The subsequent [contact boundary](docs/contact-abuse.md) closes direct anonymous RPC submission and adds server-verified Turnstile with owner-approved official test keys locally. Real production keys/deployment checks, notifications, workload/recovery and deferred commerce remain launch gates. [Admin/account presentation](docs/admin-presentation.md) removes visible raw IDs while preserving internal authorization and concurrency checks.

- Latest commerce answer: **Razorpay test mode; remove the ₹5,000 minimum for Razorpay**. Indian GST was requested, with product HSN/rates, inclusive/exclusive pricing, merchant/dispatch details and shipping still pending. Never assume one rate for the catalog; [official GST goods rates](https://cbic-gst.gov.in/gst-goods-services-rates.html) depend on classification.

- After Phase 3 commit `8ec7285`, the owner authorized the [customer dashboard and address-book extension](docs/account-dashboard.md): actual Clerk identity in the navbar, Dashboard/Shop/Settings/Logout dropdown, avatar/name settings, private contact phone and shipping/billing addresses, safe home/intended-page login returns, public company/catalog routes and protected checkout/Agent. The local Unfiltered IITians project supplies layout inspiration within PandaByte's theme. Logout is themed red; Agent uses Sparkles and Coming soon on hover/focus. **Clerk phone setup is deferred by the owner's latest correction; contact phone is unverified private database data.** This specific account work does not dispatch the remaining storefront/commerce phase.

- The owner selected [Superdesign homepage v17](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) and its corresponding screen layouts as the implementation reference. The authenticated official CLI confirmed 39 drafts. Use the matching layout for each route from [design delivery](docs/design-delivery.md), preserving real assets and responsive behavior; record the exact version when implementing. Superdesign is accessed through its official CLI here; no connected MCP capability was discovered.

- Upgrade PandaByte.in from its limited Wix catalog into a robust company, hardware commerce and learning site. The current 44-product snapshot is an import seed, not a catalog/content limit. Staff must add products, categories, pricing, discounts, FAQs, company content, team members and blogs from admin without routine code edits or deployments.
- Keep **Next.js + TypeScript, Clerk as sole identity provider, InsForge PostgreSQL/file storage, custom business APIs and eventual Vercel hosting**. The owner supplied development Clerk keys; Google customer registration and the active session are verified. Login is required before checkout; guest checkout is excluded from this baseline.
- This chat reviews/refines plans. The user now explicitly authorizes coordination with **Pandabyte.in UI design — OpenDesign…** (thread 01a16889-15db-7302-91f6-a44e92551fa3). Its latest human brief was read and a coordination message sent. Root owns these planning files; that chat owns visual artifacts and [design-delivery.md](docs/design-delivery.md). This supersedes the earlier no-coordination instruction.
- Aceternity UI is now the preferred visual component source for reusable text effects, animation, buttons, cards and presentation blocks, through its shadcn-compatible registry. Existing accessible primitives remain useful; component styling follows the same PandaByte tokens. See the [component direction](design.md) and [official CLI](https://ui.aceternity.com/docs/cli).
- Design retains the exact panda logo, light/dark, Supabase-inspired neutral/emerald styling, restrained animation and current hero direction. Supabase is a visual reference; InsForge remains the backend. Selected previews/versions and final polish remain the UI chat's work.
- ChatGPT/Codex assists development and planning. The Agent workspace and future desktop software page are prototypes/Coming soon; production AI/model calls/autonomous tools are not part of this release.
- Two Luna extra-high workers researched architecture and tools for this review. Sol 6.1 is the user's requested main coordinator model; the app controls the current model and no tool changed or independently verified it.
- The user authorized local commits, development setup and Luna xhigh workers. Phase 3 publishing and the private account extension are committed. The latest instruction fixes dependencies first, then resumes Phase 4 storefront/company pages using selected Superdesign screens. The dependency gate passed with zero audit findings and was committed as `be2fb66`; see [compatibility scope](docs/dependency-remediation.md). The [Phase 4 contract](docs/phase-4-contract.md) is implemented and verified; see [the recorded checks](docs/verification/phase-4.json). Phase 4 was committed as 80c8685. The owner subsequently authorized Phase 5 with the same Luna xhigh/check/browser/commit gates. See [Phase 5 contract](docs/phase-5-contract.md). Razorpay test mode is selected and its previous ₹5,000 minimum is removed. Test keys/webhook, approved GST/product classifications/pricing basis and shipping policy remain required before order/payment placement. Phase 6, live charges, GitHub publication, production provisioning and deployment remain outside scope.

## 2. Required product and operating scope

The first production release includes actual purchases, customer accounts and operational order handling, as well as a complete editable company/content site. A catalog demo or visual prototype does not meet that requirement.

| Area | Required behavior | Remaining input |
| --- | --- | --- |
| Brand/content | Exact existing logo; existing source facts plus new owner-authored/admin-approved material | Original media/rights and factual corrections |
| Catalog | Products/variants/SKUs/categories, media/specs/resources, search/filter/sort/detail | Export, stock and technical reconciliation |
| Pricing | Regular/sale prices, discount windows, authoritative card/PDP/checkout calculation | Coupon/stacking rules only if selected |
| Company | Editable About, team, Contact, FAQs, solution/company/policy blocks and navigation | Real team identities and approved copy |
| Publishing | Full rich blog/guide editor, revisions, private preview, draft/publish/unpublish, safe metadata/media | Editorial roles and approved content |
| Learn | Blogs, embedded resources, kit guides, YouTube video entries and product specs/resources | Owner-approved video IDs/links and documents |
| Commerce | Cart, authenticated checkout, payment verification, order/refund/fulfillment operations | Merchant, shipping/tax/invoices and test payment configuration |
| Admin | Catalog/pricing/stock, content/media, team/FAQ/contact, inquiries, orders, permissions/audit | Exact staff capabilities and retention policies |
| Quality | Responsive/accessibility, measured speed, security, backup/restore and capacity tests | Target traffic, provider limits and budget |
| Future | Agent software/runtime, LMS/forum, subscriptions, sellers, advanced CRM | Separate scope |

Do not invent people, reviews, partnerships, stock, certifications, specifications, metrics, job openings or dates. Temporary neutral team avatars are allowed in previews/unpublished drafts; publish real identities or omit unapproved cards. Competitors provide structure inspiration, never PandaByte product facts.

## 3. Audit findings and source truth

The 23 October audit inventoried 16 canonical content/listing/category pages plus 44 catalog-linked product URLs; 43 product bodies rendered and one RGB LED Matrix route returned product-not-found. Cart/checkout were additionally inspected as UI states. The full product inventory, individual SKU/spec observations, exact routes, source URLs and audit limitations are retained in the appendix below and in [current_pandabyte_findings.in](current_pandabyte_findings.in).

| Source category | Reported count | Caution |
| --- | ---: | --- |
| All products | 44 | Public snapshot, not reconciled inventory |
| Development boards | 11 | Preserve model/SKU distinctions |
| Sensors | 23 | Verify electrical/measurement claims |
| Shields | 3 | Resolve compatibility contradictions |
| Accessories | 6 | Preserve pack quantities/connectors |
| IoT kits | 2 | Preserve actual kit contents |
| Courses | 0 | No invented course library or LMS |

Category counts total 45 and may overlap. Public listing prices ranged ₹60–₹40,000. PandaPulse was ₹20,000, SKU `xC3KITV2`; xC6 was ₹900, SKU `ESPXC6`. These are dated source observations, not current price/stock promises.

Three experience problems drive the structural plan: a crowded header/horizontal overflow at the roughly 923px viewport reviewed; shallow electronics discovery beyond price/recommended sort; and learning/wiki labels without verified destinations. “Explore Wiki Pages” linked home and Product Wiki text did not establish a usable URL. Blog/tutorial content was not discoverable through audited navigation; absence of discovery does not prove no unpublished content exists.

Do not migrate contradictory technical claims unchanged: x32/xLoRa and NodeMCU shield copy names xC3m, TEMT6000 includes unrelated RGB text, and RGB LED voltage statements conflict. Do not feature the broken RGB Matrix as purchasable until corrected. Preserve unknown fields as unknown.

Public sources identify Pandabyte Innovations Private Limited, `pandabytehelp@gmail.com`, `+91-8380822931`, weekdays 10:00–17:00 and an Uttarakhand office. Confirm legal/address spelling, support timezone and founder/affiliation claims before prominent reuse. [Content/source inventory](docs/content-inventory.md).

**No Firecrawl crawl completed:** CLI 1.26.22 was unauthenticated and keyless scraping was blocked by its VPN/proxy policy. Other public retrieval/browser methods supplied the audit. No private Wix CMS, customers, orders, stock or payment configuration were inspected. A ₹60 cart was blocked and a ₹20,000 kit reached customer details; the test stopped without personal data, order or payment. The exact ₹5,000 boundary was not established by those observations.

## 4. Navigation, page skeleton and design coordination

Confirmed main order: **Solutions → Learn → About → Contact**. Keep visible Login/account, cart/theme and a clearly labeled Agent prototype entry. Remove navbar search; retain catalog search/filtering.

- Solutions includes IoT Kits, Shop IoT & embedded products with nested categories, and owner-approved public Skills/CLI tools for IoT & Embedded content, plus the future PandaByte agent software overview. The Products submenu includes owner-named QR Logger, Campus Tracker, Smart Park and Nexus Solution (AI). These concepts get truthful overview/Coming soon pages, not fabricated sellable SKUs.
- The latest UI brief describes a future downloadable Windows/Linux/macOS agent harness with an Arduino-compatible editor, PCB/CAD tools, IoT dashboard and Plan/Build/Ask modes. These are proposed future product intentions, not available capabilities. The latest UI instruction excludes Agent Desktop from homepage highlights and keeps it in Solutions/About Coming soon content. The UI chat's suggested names PandaForge/Pando are unapproved; do not finalize a name here.
- Learn includes blogs, embedded resources, kit guides, YouTube and product specs/resources. About is directly discoverable and has a dropdown. Menus work by click/keyboard/mobile as well as optional hover.
- Home sequence: hero → verified brand strip → categories → featured hardware → support card → FAQs → footer. Source logos alone do not prove a sponsorship/collaboration; label only approved relationships.
- About includes company/goals, founder/cofounder/team section, verified relationships where available, Contact card and FAQs. All ordinary content is editable. Neutral preview avatars do not create fictional founders.
- Contact includes verified office locations/details and name/email/phone/subject/message/optional attachment. Office addresses belong on Contact, not the footer. Footer has an owner-approved tagline/brand text, quick links, policies, social links and current-year copyright; exact replacement wording is a design/content decision, not a domain change.

Page families: catalog/product, solutions/Coming soon, company/About/team, Contact/Help/FAQ, blogs/guides/videos/resources, policies, projects/upcoming/careers, cart/checkout, Clerk/account/orders and staff modules. [design.md](design.md) provides routes, blocks, editable fields and state coverage. Preserve verified legacy routes or test redirects.

The design chat is active and its records change. Earlier one-homepage/v5 checks are historical; do not treat them as a current screen count. Use [design delivery](docs/design-delivery.md), [candidate tokens](.superdesign/design-system.md) and actual selected versions at handoff. Planning has not visually verified its newest screens. Keep OpenDesign/Superdesign setup and existing evidence intact.

## 5. Stack review

**Verdict: retain the selected stack.** One modular Next.js app and one InsForge business-data authority fit this scope. Clerk owns identity; InsForge supplies data/storage. A custom admin/publishing/commerce layer must still be built. No second CMS, identity provider, commerce engine or microservice is justified by the current requirements.

| Layer | Choice/direction | Implementation rule |
| --- | --- | --- |
| App | Next.js App Router, React, TypeScript | Server-render public data; small interactive client islands |
| UI | Aceternity visual components, Tailwind tokens, selected accessible shadcn primitives, Lucide icons | One reviewed system; selected Motion effects, static/reduced-motion fallbacks |
| Identity | Clerk / @clerk/nextjs | Required before checkout; authorize at every resource boundary |
| Data | InsForge PostgreSQL/storage, typed SDK and reviewed SQL/RPC | One migration owner, grants/RLS and atomic stock operations |
| APIs | Next.js server services, Route Handlers/Server Actions | Validate inputs/ownership/capabilities; server-only privileged clients |
| Search | Indexed PostgreSQL, exact SKU/model first | Bounded pagination/facets; pg_trgm only after support/need check |
| Content | Custom structured admin, Tiptap OSS editor proposed | Draft/public revisions; sanitized rich content, no arbitrary executable builder |
| Payments | Razorpay recommended | Select integration/webhook owner after staging review |
| Quality | Focused domain tests and Playwright browser tests proposed | Pin and configure only when application work starts |
| Hosting | Vercel direction | Database-aligned region, isolated staging/production |

Pin compatible stable versions and one package manager/lockfile at foundation time. Avoid Prisma initially because privileged database access can bypass RLS and needs separate pooling/authorization review. Avoid a dedicated search service until measured query/relevance requirements justify it. Future AI does not justify adding a model SDK/vector store now.

Prefer MIT UI code and retain notices. InsForge/TypeScript/Playwright use Apache-2.0; PostgreSQL has its own permissive license. Heroicons is MIT; the latest UI brief prefers Lucide under ISC, replacing the earlier icon preference. Tiptap core/selected open-source extensions are a proposal, not its paid Cloud/Pro bundle. Hosted service terms and media rights are separate from software licenses. [Historical resource ledger](docs/resources.md), [current tooling/license snapshot](docs/development-tooling.md), [Tiptap editor](https://tiptap.dev/docs/editor/getting-started/overview).

## 6. Identity, authorization and data

Clerk owns sessions/users. Business profiles, addresses, orders and explicit staff grants reference verified Clerk text subjects. Do not create a second InsForge Auth sign-in. The [official Clerk bridge](https://insforge.dev/integrations/clerk) describes a JWT-template integration with trusted signing/claims and text-subject RLS. Test the actual staging configuration and pinned SDK, including expiry/refresh/sign-out/user switching; current examples disagree on token setter names. Decoding a JWT is not signature validation.

Clerk protection belongs at resource/data boundaries; middleware or hidden UI alone is insufficient. [Clerk guidance](https://clerk.com/docs/nextjs/guides/secure/protect-content). Later protected configuration includes NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and server-only CLERK_SECRET_KEY; integration/signing secrets never belong in chat, Markdown, screenshots or client bundles. Missing keys must not produce a fake session or public admin.

| Domain | Data/invariant |
| --- | --- |
| Identity | Text Clerk subjects, own profiles/addresses, server-controlled staff capabilities |
| Catalog | Stable products/variants/SKUs, categories/relationships, ordered media/specifications/resources |
| Pricing/stock | Integer paise, price/sale revisions, valid windows, stock movements and atomic reservations |
| Content | Pages/posts/guides, FAQs, contact settings, team, navigation, approved video/resource references, publication revisions |
| Commerce | Carts, immutable order snapshots, payment attempts/events/refunds, separate fulfillment history |
| Operations | Private inquiries/attachments, moderation, audit, durable retry/reconciliation work |

Anonymous reads expose published content only; customers access their own private records. Staff permissions are explicit and server-controlled, never granted by editable profile metadata. Validate allowlisted fields/sorts and bounded queries. Keep grants/RLS alongside server checks. Protect private files independently from public product media. Financial/inventory invariants need constraints and transactions, not form validation alone.

## 7. Fully editable backend and publication

Build admin before finishing the public storefront. Staff modules cover products/variants/categories/media, regular/sale pricing, inventory, blogs/guides, FAQs, contact settings/inquiries, company/home/solution/policy blocks, team, navigation, users/roles, orders/refunds/fulfillment and reviews. [Design's editability matrix](design.md) defines fields and public effects.

“Editable” means supported business/content fields can change without deployments; new layout types/security/payment behavior still need code. Use safe structured blocks and a rich editor rather than an unrestricted executable page builder. Contact details are shared by Contact/support blocks; the office address is not rendered in the footer. FAQ records can appear on multiple approved pages without duplicated edits. Product cards compute price/discount from the same catalog source as PDP/checkout.

Draft edits do not overwrite the published revision. Staff preview is private/noindex and bypasses shared cache. Publish validates and commits an immutable revision with reliable targeted refresh/retry; record failures. Use optimistic versions to prevent silent lost edits. Restore produces an auditable new revision; slug changes require redirects; unpublish must remove public access, including stale cached routes. Only published records enter search/sitemap/metadata. Scheduled article publication is optional; if chosen it needs a real durable scheduler.

Contact submissions persist before a receipt. Phase3 stores a durable, visibly unconfigured notification row; delivery and retry processing await a selected provider/recipient. Optional attachments remain deferred until access, retention and abuse policies are selected. Team identities are owner-supplied; avatars are replaceable admin media. Add approved YouTube IDs/URLs with controlled embeds, not pasted executable iframe scripts.

The required acceptance example is concrete: create product 45+, add a category, edit its sale price, publish a blog/FAQ/team change and see correct public pages update without code or a new deployment. The Next.js/Clerk/InsForge foundation and private account operations are verified; editable catalog/content administration is not implemented yet. This remains the implementation contract.

## 8. Search, rendering and scale

Rank exact SKU/model first, normalized aliases/prefixes next, then indexed text relevance. Preserve suffixes such as ESP32-C3. Add category/price/verified-availability filters first; electrical facets need reliable data and must distinguish supply from GPIO logic voltage. Use parameterized bounded queries, allowlisted sorts, stable tie-breakers and URL filter state. Do not download the full catalog for browser filtering.

Server-render public content and keep rich editor/admin code out of storefront bundles. Fetch server data without unnecessary self-HTTP calls, use responsive images with dimensions, and scope client JavaScript to interactions. [Next.js production checklist](https://nextjs.org/docs/app/guides/production-checklist).

Cache public revisions deliberately and invalidate affected products/categories/pages/nav/articles. Define freshness and retry behavior; stale-while-revalidate is not immediate publication. Scheduled prices need a bounded display cache and authoritative calculation even if a timer is late. Account/admin/cart/checkout/private previews stay outside shared caches; checkout always rechecks price/stock. Select APIs for the pinned Next version. [Revalidation guidance](https://nextjs.org/docs/app/getting-started/revalidating).

Phase3 currently uses no-store published projections and media responses, so publication and withdrawal do not depend on shared-cache invalidation. [The operations record](docs/phase-3-operations.md) documents the restricted-Cloud storage limitation and the constrained server-only published-file read exception. Its broad project credential remains a protected server secret and a production operating risk.

Performance targets are proposals, not measured results: p75 LCP <=2.5s, INP <=200ms, CLS <=0.1; establish mobile/desktop baselines and later real-user monitoring. [Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds). The plan proposes a 10,000-SKU synthetic fixture, a defined 100-concurrent-browser workload and search p95 <=500ms as initial test targets to review against expected traffic/budget. Actual capacity depends on measured queries, connections, regions, provider quotas and workload. Validate backup AND file-storage restore, failure recovery, alerting and cost before calling the site launch-ready.

## 9. Commerce and operational safety

Clerk login is required before checkout. The owner selected Razorpay test mode and removed the ₹5,000 minimum for Razorpay. Earlier threshold requirements and examples are historical. Cart quotes use current published prices; stock and final tax/shipping totals must be revalidated at checkout.

Re-read current prices/stock; compute integer-paise totals server-side; atomically reserve stock and snapshot order facts; commit before external payment calls. Verify provider signatures/state, never trust a redirect to mark paid. Use one webhook owner, unique event IDs, idempotent transitions and durable retries/reconciliation. Handle reservation expiry, late success, cancellation/refund and fulfillment exactly once. Preserve immutable order history and audit sensitive staff actions.

Use InsForge-managed Razorpay test payments and its single managed webhook receiver after keys, webhook and caller/amount authorization are verified. Resolve merchant/GST/invoices/shipping/returns and operational responsibilities. Required tests cover changed prices, concurrent last-unit purchases, retries/cancellation, forged/duplicate/out-of-order events, expiry/late success and refunds. Customer data/access and staff privileges need separate tests. No real payment/provider setup occurred in planning.

## 10. Development tools and agent workflow

The [development-tooling shortlist](docs/development-tooling.md) records official sources, dated stars/forks/activity/licenses, daily/weekly Trending observations, availability and local/cloud caveats. Popularity is supporting evidence, not a guarantee; none of the 12 shortlisted repositories appeared in the returned global Trending pages at capture.

Use official InsForge CLI/skills for authorized staging work; reuse the exposed GitHub and Vercel connectors. Next.js DevTools MCP is useful later with a running supported local app. Prefer Playwright Test for CI and one interactive browser path; optional Playwright CLI/skill can complement the existing browser tool. shadcn CLI adds selected Aceternity registry components and needed primitives; its MCP and Context7 remain optional. Inspect source/dependencies and per-component terms, and keep paid Pro assets separate. The tooling review installed no providers. Next.js dependency installation is now authorized as part of initialization; the existing Pandabyte backend is now linked under the latest authorization.

Remote MCP can be useful for cloud agents, but local configuration/authentication/dev servers do not automatically transfer. Verify each executor and credential scope independently. The optional OpenAI documentation MCP is read-only guidance, not a customer AI dependency. [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Read relevant skills only when needed: Ponytail; InsForge CLI/SDK/integrations; Next/React guidance; UI/UX Pro Max and existing Superdesign workflow; verification/browser tools. Give parallel workers bounded ownership, agree contracts first, retain one migration/lockfile owner and integrate through root review. No speculative agent framework is needed to develop this application agentically.

## 11. Delivery sequence

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — completed documentation baseline | Reviewed context, design contracts, plan and tooling research | Document links/consistency/source preservation |
| Initialization — verified/committed | Next.js local project | Lint/typecheck/build, built-in-browser smoke checks, review and local commit |
| 1 — preparation checkpoint | Contracts, operating decisions and relevant visual handoff; required decisions pending | Models/roles/policies and selected component directions |
| 2 | Authorized app, Clerk/InsForge and data foundation | Real identity/RLS/private-file checks |
| 3 | Editable admin and publishing | Draft/preview/publish, revision/permission tests, edits without deployment |
| 4 | Storefront/search/company/learning pages | Real admin-to-public flows, discovery/accessibility/performance baseline |
| 5 | Authenticated commerce and operations | Test-mode payment/order/stock/fulfillment/refund matrix |
| 6 | Migration, capacity and readiness | Security/restore/load/redirect/operational evidence |
| 7 | Separately authorized production release | Production readiness, rollback and smoke checks |
| Later | Agent software/runtime and other advanced products | Separate scope and acceptance |

[plan.md](plan.md) contains frontend/backend tasks and gates; the [Phase 1 contracts](docs/phase-1-contracts.md) and [design handoff snapshot](docs/phase-1-design-handoff.md) make the next implementation slice concrete without approving pending designs or live integrations. Backend foundation work may proceed after authorization while unrelated design polish continues; only implement visual components against the relevant approved handoff.

## 12. Open decisions and evidence limits

At foundation: customer/staff data permissions, private storage, staff capabilities/bootstrap, regions/traffic/budget. At content import: corrected facts, originals/rights, real team data, videos/resources, approved product/software names/claims and retention/editorial rules. At commerce: merchant/shipping/tax/invoices, discount/coupon policies and refund/late-payment/notification ownership. At release: migration permissions, analytics/consent, recovery objectives, tested capacity and explicit production instruction.

These do not block planning. Never fabricate secrets, identities, stock, provider connections or successful tests. The original audit did not inspect private Wix systems and Firecrawl did not complete; those limits remain true. Shared frontend browser checks are recorded in [the frontend evidence](docs/verification/phase-2-frontend.json); full selected screen bodies are still future work. See [phase progress](docs/phase-progress.md) for current build/typecheck/browser evidence; the signed-out checks and authenticated browser → Clerk → InsForge identity round trip pass; customer-row/staff/private-storage permissions passed their separate live API/SDK/browser checks.

## 13. Repository map and verification

- README.md: canonical decisions and complete original audit below.
- [design.md](design.md): navigation, routes, standard blocks, full editability and UI states.
- [plan.md](plan.md): ordered implementation and acceptance gates.
- [AGENTS.md](AGENTS.md): authorization, skill and collaboration rules.
- [project.md](project.md) / [research.md](research.md): compatibility entry points; older full briefs in docs/archive/.
- [content inventory](docs/content-inventory.md), [resource ledger](docs/resources.md), [tooling review](docs/development-tooling.md): evidence and source/tool limits.
- docs/design-*.md and .superdesign/: preserved visual records, with ongoing delivery owned by the UI chat.

Current application routes live in root app/, with root TypeScript/config/package files and public/brand for the unchanged logo. Subsequent public/account/admin/API routes, shared UI, server domain services, typed data access, a single migration path and focused tests are added when their phase is authorized and ready. Create directories only when used; no empty monorepo scaffolding. Preserve owner assets and historical evidence during cleanup.

Review verification covers local Markdown targets, shared phase/navigation/auth decisions, source appendix equality and absence of new app/Git setup. Live provider, capacity and commerce checks remain future work. Local application checks are recorded in docs/phase-progress.md. The earlier documentation-only review verified 110 local links across 16 Markdown documents after the Aceternity update, all resolving; the original audit appendix matched exactly, phases 0–7 and required admin modules were present, and no package manifest or Git initialization existed. This excludes the UI chat’s concurrent visual outputs.

## 14. Original public audit appendix

The complete dated audit below preserves product/source evidence. Historical recommendations do not override the current decisions above. Prices/specifications require reconciliation; existing content is not a cap on owner-authored catalog growth.

<!-- current-site-audit:start -->

# PandaByte public-site audit (research snapshot)

**Checked:** 2026-10-23 (Asia/Kolkata).  
**Scope:** Public pages and storefront UI on `https://www.pandabyte.in/`; public external links discovered in the site footer; official Wix help pages for migration boundaries.  
**Purpose:** Content and migration inventory for planning a company, commerce, and learning site. This is a factual audit, not a claim that the private Wix backend was inspected.

## Scope, method, and limits

- Navigated the public home page, top navigation, footer, every visible store category, all three pages of All Products, each product-card destination, public policy links, and the empty/non-empty cart and checkout flow. The public All Products listing declares 44 products and exposes 20 + 20 + 4 items across pages 1–3; its category links provide the 44 exact product-page routes below.
- Opened public pages using web retrieval and inspected the rendered storefront in a separate, newly opened browser tab. The cart test used PandaPulse (₹20,000), then a ₹60 LED module to observe minimum-order behavior. Both temporary cart items were removed; the test cart was left empty. No personal information was entered, no account was used, and no payment/order was submitted.
- **Firecrawl requested-tool attempt:** read the official [`firecrawl/cli` repository](https://github.com/firecrawl/cli), its [CLI docs](https://docs.firecrawl.dev/sdks/cli), and the official [`firecrawl`](https://raw.githubusercontent.com/firecrawl/cli/main/skills/firecrawl/SKILL.md), [`firecrawl-map`](https://raw.githubusercontent.com/firecrawl/cli/main/skills/firecrawl-map/SKILL.md), [`firecrawl-scrape`](https://raw.githubusercontent.com/firecrawl/cli/main/skills/firecrawl-scrape/SKILL.md), and [`firecrawl-crawl`](https://raw.githubusercontent.com/firecrawl/cli/main/skills/firecrawl-crawl/SKILL.md) instructions. Ran `npx.cmd -y firecrawl-cli@latest --status`: CLI `v1.26.22`, not authenticated. Tried keyless `scrape https://www.pandabyte.in/`; it stopped before fetching because Firecrawl flagged this network IP as VPN/proxy and required API-key authentication. The official map/crawl skill docs also say those commands require authentication, so they were not invoked. No login, sign-up, API-key reading, global install, or `init` was performed; `.firecrawl/` was created but no scrape output was produced. Firecrawl therefore contributes method/auth status only; page content below comes from the other read-only public methods described above.
- **Coverage totals:** 16 canonical content/listing/category pages + 44 catalog-linked product-page URLs = 60 site URLs inventoried; cart and checkout were additionally observed as two public UI states. All 44 names, listing prices, and slugs are from the live paginated catalog checked today. Individually opened all 44 PDP routes: 43 rendered product bodies and one catalog-linked PDP rendered a product-not-found state. The visible PDP fields are transcribed below as concise summaries; specifications were not independently validated against manufacturer documentation, owner exports, stock records, or historical data.
- Tried `https://www.pandabyte.in/robots.txt`, `/sitemap.xml`, and `/sitemap_index.xml`; the web retrieval tool reported each URL “not accessible via this tool.” This is **not** proof that these endpoints return 404 or that the site has no sitemap. Route guesses for `/blog`, `/tutorials`, `/wiki`, `/wiki-pages`, and `/courses` were not verified as absent; only `/category/courses` is a confirmed empty category. No “all pages” claim is made beyond public routes exposed by the audited navigation, footer, catalog, and the explicitly attempted paths.
- Search results, account/member-only pages, wishlist contents, payment provider selection, live inventory/admin data, unlinked CMS entries, hidden/draft pages, private integrations, order history, customer records, and original untransformed media were not accessible or enumerated. No authentication probes were attempted.

### Crawl manifest / fetch state

| Discovered path or group | Fetch state in this audit |
|---|---|
| `/`, `/about`, `/contact`, `/help-center`; `/category/all-products`, `/category/all-products?page=2`, `/category/all-products?page=3`; `/category/microcontroller`, `/category/sensors`, `/category/shields`, `/category/accessories`, `/category/iot-kits`, `/category/courses`; `/shipping-and-returns`, `/terms-and-conditions`, `/privacy-policy` | Web retrieval returned page content today. Routes and contents are summarized below. |
| 44 `/product-page/<slug>` routes in product inventory | Individually opened. 43 PDP bodies rendered and were read through public web retrieval or the separate browser tab; the RGB LED Matrix route rendered a product-not-found state despite remaining linked from the catalog. See the 44-row PDP verification table below. Firecrawl was not used for page extraction because its keyless request was blocked by the network/auth gate described above. |
| `/cart-page` and `/checkout?checkoutId=<session-specific>` | Rendered and tested in a separately opened browser tab. Cart threshold was tested at ₹60 and a ₹20,000 cart; checkout fields were viewed without entering details. |
| `/account/my-wishlist`; header Log In control; Help Center search | Public entry/control discovered, but account contents/search results were not used or inspected. |
| Footer social links: `https://whatsapp.com/channel/0029VaIceRtInlqNQBoRTC0J`; `https://www.youtube.com/@PandaByteInnovations` | Exact outbound links discovered in page footer; external channel contents were not fetched/audited. |
| `https://www.pandabyte.in/robots.txt`; `https://www.pandabyte.in/sitemap.xml`; `https://www.pandabyte.in/sitemap_index.xml` | Requested through web retrieval; each returned “not accessible via this tool.” HTTP status / endpoint existence remains unknown. Firecrawl map could not run without authentication. |
| Guessed `https://www.pandabyte.in/blog`, `/tutorials`, `/wiki`, `/wiki-pages`, `/courses` | Retrieval did not establish page content or a not-found response; route existence remains unknown. `/category/courses` is separately verified and empty. |
| PDP text resource “Product Wiki”; footer “Explore Wiki Pages” | Product Wiki rendered as text with no destination in the extracted view. Footer link destination was resolved as `https://www.pandabyte.in/` (home), not a distinct wiki. |

## Verified public route inventory

| Area | Exact public URL | Observed content / state |
|---|---|---|
| Home | [pandabyte.in](https://www.pandabyte.in/) | Hero for IoT experimentation, IoT-kit and development-board promotions, “New Products”, shop-by-category tiles, brand tiles, Help Center/footer. A banner says minimum order value ₹5,000. |
| About | [About](https://www.pandabyte.in/about) | Company identity and positioning around IoT hardware and learning resources. The page claims it was founded by faculty members of IIT Roorkee and IIIT Vadodara; that statement was not independently validated. |
| Contact | [Contact](https://www.pandabyte.in/contact) | Customer-care phone, weekday hours, email, registered-office address, and a form for name/email/phone/query/file upload. |
| Help | [Help Center](https://www.pandabyte.in/help-center) | FAQ topics include ESP32, IDE setup, power, beginner materials, sensor/cloud integration, and support. FAQ text references guides/tutorials and future YouTube learning materials, but the audited page itself did not expose a browsable lesson/library index. |
| All products | [Page 1](https://www.pandabyte.in/category/all-products), [page 2](https://www.pandabyte.in/category/all-products?page=2), [page 3](https://www.pandabyte.in/category/all-products?page=3) | 44 products total; visible price range ₹60–₹40,000; one Price filter and Recommended sort. Catalog items link to PDPs in inventory below. |
| Dev Boards | [Microcontroller category](https://www.pandabyte.in/category/microcontroller) | 11 products; ₹250–₹3,203; product listing is paginated/single page. |
| Sensors | [Sensors category](https://www.pandabyte.in/category/sensors) | 23 products; ₹60–₹6,000; product listing spans two pages. |
| Shields | [Shields category](https://www.pandabyte.in/category/shields) | 3 products; ₹400–₹750. |
| Accessories | [Accessories category](https://www.pandabyte.in/category/accessories) | 6 products; ₹100–₹300. |
| IoT Kits | [IoT Kits category](https://www.pandabyte.in/category/iot-kits) | 2 products; ₹20,000 and ₹40,000. |
| Courses | [Courses category](https://www.pandabyte.in/category/courses) | Explicitly displays 0 products and an empty-category message. |
| Shipping/returns/cancellation | [Shipping, Returns, & Cancellation](https://www.pandabyte.in/shipping-and-returns) | Policy describes courier partners and delivery, damage-on-arrival handling, cancellation, returns, and refund rules. Validate current operative terms with the business owner before reusing or rewriting legal text. |
| Terms | [Terms & Conditions](https://www.pandabyte.in/terms-and-conditions) | Store terms; page identifies the operator as Pandabyte Innovations Pvt. Ltd. |
| Privacy | [Privacy Policy](https://www.pandabyte.in/privacy-policy) | Describes purchase/contact data, browsing/IP information, and communications/consent. Revalidate privacy/legal copy before migration. |
| Cart | [Cart page](https://www.pandabyte.in/cart-page) | Public cart has item quantities/removal, promo code, note, delivery destination, subtotal, delivery, total, and checkout path. |
| Checkout | [Checkout entry](https://www.pandabyte.in/checkout) | The cart creates a session-specific `checkoutId`; URL changes per session. Checkout UI requires email, first/last name, phone, country/region, address, city, region, and postal code before delivery/payment stages. Payment methods were not inspected because required customer details were not entered. |

**Category count note:** The category counts add up to 45, one more than the 44 distinct products in All Products. This indicates at least one product is assigned to more than one category or the public category counts differ from the all-products list; the public view does not reveal primary-category semantics. Do not assume categories are disjoint.

## Product inventory (current listing titles and prices)

Prices are the public listing values observed on 2026-10-23. “Regular → sale” denotes a crossed-out regular price and displayed sale price. Stock/availability was not established by these card listings. Each title is linked to its verified PDP route.

| # | Product | Listing price (INR) | Verified product URL |
|---:|---|---:|---|
| 1 | M5Stack Single Live Wire Wi-Fi Smart Switch (ESP32-C6) | ₹3,203 | [PDP](https://www.pandabyte.in/product-page/m5stack-single-live-wire-wi-fi-smart-switch-esp32-c6) |
| 2 | M5Stack AtomS3 Lite ESP32S3 Dev Kit | ₹1,233 | [PDP](https://www.pandabyte.in/product-page/atoms3-lite-esp32s3-dev-kit) |
| 3 | PandaByte xPM Particulate Matter PM1/PM2.5/PM10 Sensor | ₹2,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xpm-particulate-matter-pm1-pm2-5-pm10-sensor) |
| 4 | PandaByte NodeMCU x8266 WiFi Development Board | ₹250 | [PDP](https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board) |
| 5 | 18650 Battery Holder with Switch | ₹100 | [PDP](https://www.pandabyte.in/product-page/18650-battery-holder-with-switch) |
| 6 | PandaByte xC3 ESP32-C3 Development Board | ₹350 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible) |
| 7 | PandaByte xC5 ESP32-C5 Development Board | ₹1,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible) |
| 8 | PandaByte Bosch BMV080 Air Quality PM1/PM2.5/PM10 Sensor | ₹8,000 → ₹6,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-bmv080-air-quality-pm1-pm2-5-pm10-sensor) |
| 9 | PandaByte MAX485 TTL To RS485 5V 12V | ₹300 | [PDP](https://www.pandabyte.in/product-page/pandabyte-max485-ttl-to-rs485-5v-12v) |
| 10 | x32 xLoRa Grove Expansion Board Shield HAT | ₹750 | [PDP](https://www.pandabyte.in/product-page/x32-xlora-grove-expansion-board-shield-hat) |
| 11 | NodeMCU Grove Expansion Board Shield HAT | ₹650 | [PDP](https://www.pandabyte.in/product-page/nodemcu-grove-expansion-board-shield-hat) |
| 12 | xC3m Grove Expansion Board Shield HAT | ₹400 | [PDP](https://www.pandabyte.in/product-page/xc3m-grove-expansion-board-shield-hat) |
| 13 | Grove Female Header SMD Regular (10 units) | ₹140 | [PDP](https://www.pandabyte.in/product-page/grove-female-header-smd-regular-10-units) |
| 14 | Grove Female Header SMD 90 Degree (10 units) | ₹110 | [PDP](https://www.pandabyte.in/product-page/grove-female-header-smd-90-degree-10-units) |
| 15 | PandaByte RGB LCD Backlight Grove Module | ₹280 | [PDP](https://www.pandabyte.in/product-page/pandabyte-rgb-rgb-lcd-backlight-grove-module) |
| 16 | PandaByte Accelerometer Gyroscope MPU6050 Grove Sensor | ₹300 | [PDP](https://www.pandabyte.in/product-page/pandabyte-accelerometer-gyroscope-mpu6050-grove-sensor) |
| 17 | PandaByte OLED Screen Display 0.96 Inch Grove | ₹600 | [PDP](https://www.pandabyte.in/product-page/pandabyte-oled-screen-display-0-96-inch-grove) |
| 18 | PandaByte RGB LED Strip WS2812B XIAO Footprint with Switch | ₹250 | [PDP](https://www.pandabyte.in/product-page/pandabyte-rgb-led-strip-ws2812b-xiao-footprint-with-switch) |
| 19 | Maker UNO: Simplifying Arduino for Education | ₹700 | [PDP](https://www.pandabyte.in/product-page/maker-uno-simplifying-arduino-for-education) |
| 20 | Female to Female Breadboard Jumper Dupont 2.54mm Cable 40 Pcs (10CM) | ₹100 | [PDP](https://www.pandabyte.in/product-page/female-to-female-breadboard-jumper-dupont-2-54mm-cable-40-pcs-10cm) |
| 21 | PandaByte LoRaWAN Kit 868 MHz | ₹40,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-lorawan-kit-868-mhz) |
| 22 | PandaByte Grove LED and Switch Module | ₹200 | [PDP](https://www.pandabyte.in/product-page/led-switch-module) |
| 23 | PandaByte Single Color Grove LED Light Emitting Diode | ₹60 | [PDP](https://www.pandabyte.in/product-page/single-color-led-light-emitting-diode) |
| 24 | PandaByte Active Buzzer Sensor Grove Module | ₹100 | [PDP](https://www.pandabyte.in/product-page/active-buzzer-sensor-module) |
| 25 | PandaByte Temperature Humidity DHT11 Grove Sensor | ₹300 | [PDP](https://www.pandabyte.in/product-page/temperature-humidity-dht11-sensor) |
| 26 | PandaByte Accelerometer ADXL345 Grove Sensor | ₹750 | [PDP](https://www.pandabyte.in/product-page/accelerometer-adxl345-grove-compatible) |
| 27 | PandaByte Barometric Pressure BMP580 Grove Sensor | ₹650 | [PDP](https://www.pandabyte.in/product-page/barometric-pressure-sensor-bmp580-grove-compatible) |
| 28 | PandaPulse ESP32 IoT Kit | ₹20,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit) |
| 29 | 2.4A Type-C Data & Charging USB Cable | ₹140 | [PDP](https://www.pandabyte.in/product-page/2-4a-type-c-data-charging-usb-cable) |
| 30 | PandaByte NEO-6M GPS Grove Sensor | ₹480 → ₹360 | [PDP](https://www.pandabyte.in/product-page/neo-6m-gps-grove-compatible) |
| 31 | RGB LED Circular WS2812B WeMoS D1 Mini | ₹100 | [PDP](https://www.pandabyte.in/product-page/rgb-led-circular-ws2812b-wemos-d1-mini) |
| 32 | PandaByte RGB LED Matrix WS2812B XIAO Footprint | ₹300 | [PDP](https://www.pandabyte.in/product-page/pandabyte-rgb-led-matrix-ws2812b-xiao-footprint) |
| 33 | M5Stack Mini Scale Weighing Unit (HX711) | ₹800 | [PDP](https://www.pandabyte.in/product-page/m5stack-mini-scale-weighing-unit-hx711) |
| 34 | PandaByte Potentiometer 10K ohm Grove Sensor | ₹150 | [PDP](https://www.pandabyte.in/product-page/pandabyte-potentiometerv-10k-ohm) |
| 35 | PandaByte Light TEMT6000 Grove Sensor | ₹150 | [PDP](https://www.pandabyte.in/product-page/light-sensor-temt6000-grove-compatible) |
| 36 | PandaByte RGB LED Grove Module | ₹70 | [PDP](https://www.pandabyte.in/product-page/rgb-led-grove-compatible) |
| 37 | Grove Universal 4 Pin 20cm Unbuckled Cable (5 PCs Pack) | ₹300 | [PDP](https://www.pandabyte.in/product-page/grove-universal-4-pin-20cm-unbuckled-cable-5-pcs-pack) |
| 38 | PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar | ₹3,500 → ₹3,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible) |
| 39 | PandaByte xC6 ESP32-C6 Development Board | ₹900 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible) |
| 40 | PandaByte xS3 ESP32-S3 Development Board | ₹1,000 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible) |
| 41 | PandaByte xC3m ESP32-C3 Development Board | ₹480 | [PDP](https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible) |
| 42 | PandaByte Push Button Switch Grove Sensor | ₹70 | [PDP](https://www.pandabyte.in/product-page/push-button-switch) |
| 43 | PandaByte GP-02 GPS BDS GNSS Grove Sensor | ₹800 | [PDP](https://www.pandabyte.in/product-page/pandabyte-gp-02-gps-bds-gnss) |
| 44 | PandaByte x32 ESP32 Development Board | ₹700 | [PDP](https://www.pandabyte.in/product-page/esp32-x32-microcontroller-board-arduino-compatible) |

## PDP and catalog fields observed

- Product pages use a consistent product-detail pattern: breadcrumb, image gallery/thumbnails, title, SKU (where populated), price and sale price (where applicable), quantity, Add to Cart / Buy Now, PRODUCT INFO prose, and related-product cards. Some pages expose a Specification block and some have a Resources section; a resource called “Product Wiki” appears as text on the PandaPulse page but no usable destination was exposed in the rendered/crawled page.
- Representative source-backed spec examples: the ₹60 single-color LED PDP shows 3.3–5 V DC, random color, and Grove/2-pin output; the xPM PDP describes a particulate sensor with UART/PWM and Grove/2.54 mm connections; xC3m lists ESP32-C3 processor, memory, Wi-Fi/Bluetooth, and common bus/peripheral interfaces; PandaPulse displays SKU `xC3KITV2`, ₹20,000 and a kit contents list. These are examples, not a normalized verification of every specification.
- Recommended migration schema (populate only from the actual source record/export): stable source ID/slug; title; SKU; brand/manufacturer; primary and secondary category; visible/status; regular and sale price with currency; options/variants and per-variant SKU/price/stock; inventory quantity/availability; product/short description; structured specs; explicit compatibility; included items and quantities; image/video URLs or media IDs, alt text, and order; product-documentation/tutorial links; shipping dimensions/weight; and legacy URL for redirects. Maintain a separate source/verification field for every normalized spec.
- Electronics-specific structured fields should be nullable and product-family appropriate: MCU/chip, board/module family, input and operating voltage, current/power where stated, I/O levels, interfaces/protocols (e.g. UART, I²C, SPI, PWM, RS-485, LoRaWAN), connector/pinout, wireless band, measurements/range/accuracy, dimensions, environmental limits, supported host/firmware, and contents. Do not derive voltage compatibility or “works with” claims from family names alone.
- Stock, detailed variant/options data, admin price/discount fields, media alt text/order, category-primary mapping, and authoritative package contents still require the owner’s product export or verification. Publicly visible SKUs/spec claims are not a substitute for inventory data or manufacturer validation.

### Individual PDP verification (44 catalog-linked routes)

Opened every route on 2026-10-23 using public web retrieval; five timeout cases were then read in a separate browser tab. Forty-three rendered product bodies and one URL showed a product-not-found state. The following are concise summaries of what each live PDP displayed, not manufacturer-verified specifications. Image means at least one product image was visible; thumbnail counts appear only when captured by the retrieval result. A resource label/link is recorded only when visible; link functionality was not comprehensively tested.

| # | PDP route and fetch result | Visible SKU | Page claims, resources, media |
|---:|---|---|---|
| 1 | [M5Stack Single Live Wire Smart Switch](https://www.pandabyte.in/product-page/m5stack-single-live-wire-wi-fi-smart-switch-esp32-c6) — fetched | Not shown | ESP32-C6-MINI-1, latching relay, AC 100–230 V, ESP-NOW firmware/SDK; image; no resource link exposed. |
| 2 | [AtomS3 Lite](https://www.pandabyte.in/product-page/atoms3-lite-esp32s3-dev-kit) — browser fetch after timeout | Not shown | ESP32-S3FN8, 8 MB flash, 24 × 24 × 9.5 mm, Wi-Fi, IR/RGB/button, USB-C; image, count not captured; no resource link exposed. |
| 3 | [xPM particulate sensor](https://www.pandabyte.in/product-page/pandabyte-xpm-particulate-matter-pm1-pm2-5-pm10-sensor) — fetched | xPBPM | Winsen ZH03B, PM1/PM2.5/PM10, UART/PWM, Grove and 2.54 mm; image + 2 thumbnails; Resources heading with no link exposed. |
| 4 | [NodeMCU x8266 board](https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board) — fetched | ESPX8266 | ESP8266, 80/160 MHz, 4 MB flash, 2.4 GHz Wi-Fi, 3.3 V logic, USB-C, GPIO/PWM/ADC/SPI/I²C/UART; image + 2 thumbnails; Product Wiki text and Espressif ESP8266 datasheet link. |
| 5 | [18650 holder with switch](https://www.pandabyte.in/product-page/18650-battery-holder-with-switch) — fetched | 18650HOLDER | Single 18650, stated 3.7 V/max 1 A; warning says holder lacks charge/discharge protection; image + 2 thumbnails; Product Wiki text. |
| 6 | [xC3 ESP32-C3 board](https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible) — fetched | ESPXC3 | RISC-V up to 160 MHz, Wi-Fi, BLE 5/mesh, 3–3.6 V; image + 2 thumbnails; Product Wiki text and Espressif datasheet link. |
| 7 | [xC5 ESP32-C5 board](https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible) — fetched | ESPXC5 | RISC-V 240 MHz, stated 8 MB flash/PSRAM, dual-band Wi-Fi 6, BLE, Zigbee, Thread; image + 3 thumbnails; Product Wiki text and Espressif datasheet link. |
| 8 | [Bosch BMV080 sensor](https://www.pandabyte.in/product-page/pandabyte-bmv080-air-quality-pm1-pm2-5-pm10-sensor) — browser fetch after timeout | PB-BMV080 | PM1/2.5/10, I²C, Grove/2.54 mm; copy says free xS3 16 MB board included and notes ESP32/16 MB library constraint; image, count not captured; YouTube tutorial, Arduino library, Bosch specs and SDK links. Verify offer and software claims. |
| 9 | [MAX485 TTL-to-RS485 module](https://www.pandabyte.in/product-page/pandabyte-max485-ttl-to-rs485-5v-12v) — fetched | PB-MAX485 | 5 V controller supply, 12 V barrel input for external sensors, MODBUS/RS485 references; image + 2 thumbnails; no resource link exposed. |
| 10 | [x32 xLoRa Grove HAT](https://www.pandabyte.in/product-page/x32-xlora-grove-expansion-board-shield-hat) — fetched | X32SHIELD | Says x32/xLoRa compatibility, up to 16 Grove sensors and selectable 3.3/5 V; one image; Product Wiki text. Product Info calls it an xC3m shield, inconsistent with title/spec section. |
| 11 | [NodeMCU Grove HAT](https://www.pandabyte.in/product-page/nodemcu-grove-expansion-board-shield-hat) — browser fetch after timeout | NODEMCUHAT | Says NodeMCU V3 compatible but not PandaByte x8266, 13 Grove ports, selectable 3.3/5 V and WS2812B; image, count not captured; Product Wiki text. Generic Product Info calls it an xC3m shield, inconsistent with compatibility text. |
| 12 | [xC3m Grove HAT](https://www.pandabyte.in/product-page/xc3m-grove-expansion-board-shield-hat) — fetched | XC3MHAT | xC3m compatibility, 9 Grove connections, selectable 3.3/5 V; one image; Product Wiki text. |
| 13 | [Regular Grove female headers, 10 pack](https://www.pandabyte.in/product-page/grove-female-header-smd-regular-10-units) — fetched | GRSMDREG | Four-pin, 2.0 mm pitch; stated 2 A/250 V and −25…85 °C; image + 3 thumbnails; regular-vs-90-degree copy; no resource link exposed. |
| 14 | [90-degree Grove female headers, 10 pack](https://www.pandabyte.in/product-page/grove-female-header-smd-90-degree-10-units) — fetched | GRSMD90D | Four-pin, 2.0 mm pitch; same stated electrical/temperature ratings as regular version; image + 3 thumbnails; no resource link exposed. |
| 15 | [RGB LCD backlight Grove module](https://www.pandabyte.in/product-page/pandabyte-rgb-rgb-lcd-backlight-grove-module) — fetched | LCDBACKLIT | RGB/backlight description, 3.0–3.2 V forward-voltage claim and 5 V reverse figure; says Grove supports two colors due to two data pins; image + 3 thumbnails; no resource link exposed. |
| 16 | [MPU6050 Grove sensor](https://www.pandabyte.in/product-page/pandabyte-accelerometer-gyroscope-mpu6050-grove-sensor) — fetched | MPU6050 | Six-axis accelerometer/gyro, I²C, selectable ranges and DMP references; one image; no resource link exposed. |
| 17 | [0.96-inch OLED Grove display](https://www.pandabyte.in/product-page/pandabyte-oled-screen-display-0-96-inch-grove) — fetched | PB96OLED | 128 × 64 display, four-pin/Grove and I²C claims; image + 2 thumbnails; no resource link exposed. |
| 18 | [WS2812B XIAO LED strip with switch](https://www.pandabyte.in/product-page/pandabyte-rgb-led-strip-ws2812b-xiao-footprint-with-switch) — fetched | RGB10WS | 10 LEDs in a 1 × 10 strip, switch, Grove/2.54 mm connectors and XIAO ESP32-C3 footprint; image + 4 thumbnails; no resource link exposed. |
| 19 | [Maker UNO](https://www.pandabyte.in/product-page/maker-uno-simplifying-arduino-for-education) — fetched | MAKERUNO | Arduino-compatible UNO positioning, onboard LEDs/buzzer/button and pin-spacing claims; image + 3 thumbnails; no resource link exposed. |
| 20 | [Female-to-female Dupont cable, 40 pcs](https://www.pandabyte.in/product-page/female-to-female-breadboard-jumper-dupont-2-54mm-cable-40-pcs-10cm) — fetched | DUPONT | 40 colored 10 cm leads, 2.54 mm header compatibility; one image; no resource link exposed. |
| 21 | [LoRaWAN Kit 868 MHz](https://www.pandabyte.in/product-page/pandabyte-lorawan-kit-868-mhz) — fetched | LORAKIT | Contents list one SenseCAP M2 SX1302 gateway and five each of xLoRa boards, DHT11 sensors, solar panels, USB cables and Dupont packs; one image; no resource link exposed. |
| 22 | [Grove LED and switch module](https://www.pandabyte.in/product-page/led-switch-module) — fetched | PBLEDSW | Switch voltage 3.3/5 V, contact/lifetime values and LED voltage claims; image + 3 thumbnails; no resource link exposed. |


| 23 | [Single-color Grove LED](https://www.pandabyte.in/product-page/single-color-led-light-emitting-diode) — fetched | PBSLED | 3.3–5 V, random red/green/blue, two-pin/Grove claims; image + 3 thumbnails; no resource link exposed. |
| 24 | [Active buzzer Grove module](https://www.pandabyte.in/product-page/active-buzzer-sensor-module) — fetched | PBABUZZ | 4.5–5 V, 50 mA, 2.3 kHz ±0.4 and 85 dB claims; image + 3 thumbnails; no resource link exposed. |
| 25 | [DHT11 temperature/humidity Grove sensor](https://www.pandabyte.in/product-page/temperature-humidity-dht11-sensor) — fetched | PBDHT11 | 3.3–5.5 V and stated 20–90% RH / 0–50 °C range; image + 3 thumbnails; no resource link exposed. |
| 26 | [ADXL345 Grove sensor](https://www.pandabyte.in/product-page/accelerometer-adxl345-grove-compatible) — fetched | PBADXL345 | Three-axis accelerometer, SPI/I²C and selectable resolution/range claims; image + 3 thumbnails; no resource link exposed. |
| 27 | [BMP580 Grove sensor](https://www.pandabyte.in/product-page/barometric-pressure-sensor-bmp580-grove-compatible) — fetched | PBBMP580 | 30–125 kPa, −40…85 °C, SPI/I3C/I²C interface claims; image + 2 thumbnails; no resource link exposed. |
| 28 | [PandaPulse ESP32 IoT Kit](https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit) — fetched | xC3KITV2 | ₹20,000 page; headline says 21 Units plus free LED-switch, itemized list has 17 rows with quantity-bearing rows; one image; Product Wiki text but no usable destination exposed. |
| 29 | [USB Type-C cable](https://www.pandabyte.in/product-page/2-4a-type-c-data-charging-usb-cable) — fetched | USBTYPEC | 2.4 A, 480 Mbps and 1 m claims; one image; no resource link exposed. |
| 30 | [NEO-6M GPS Grove sensor](https://www.pandabyte.in/product-page/neo-6m-gps-grove-compatible) — fetched | PBNEO6M | 3–5 V, UART and 9600 default baud claim; image + 2 thumbnails; sale price shown in catalog; no resource link exposed. |
| 31 | [Circular WS2812B WeMos D1 Mini LED](https://www.pandabyte.in/product-page/rgb-led-circular-ws2812b-wemos-d1-mini) — fetched | RGBWEMOS | 12 WS2812B LEDs, circular board, switch and WeMos D1 Mini footprint claims; image + 2 thumbnails; no resource link exposed. |
| 32 | [RGB LED Matrix XIAO product](https://www.pandabyte.in/product-page/pandabyte-rgb-led-matrix-ws2812b-xiao-footprint) — product-not-found state | Not available | Catalog still links the ₹300 card, but direct PDP displayed “This product couldn't be found.” No PDP SKU/spec/resource body available; image is visible on catalog card, not verified on PDP. |
| 33 | [M5Stack Mini Scale HX711](https://www.pandabyte.in/product-page/m5stack-mini-scale-weighing-unit-hx711) — fetched | SCALEHX711 | 5 kg weighing-unit claim, HX711, STM32F030F4P6, I²C and RGB/tare references; image + 2 thumbnails; no resource link exposed. |
| 34 | [10 kΩ potentiometer Grove sensor](https://www.pandabyte.in/product-page/pandabyte-potentiometerv-10k-ohm) — fetched | PB10KPOT | 10 kΩ ±20%, 20 V/50 mW claims, Grove and male-header references; image + 3 thumbnails; no resource link exposed. |
| 35 | [TEMT6000 light Grove sensor](https://www.pandabyte.in/product-page/light-sensor-temt6000-grove-compatible) — browser fetch after timeout | TEMT6000 | Ambient-light phototransistor/SMD 1206 and Grove claims; image, count not captured; Product Info includes unrelated RGB-module/data-pin text; no resource section noted. |
| 36 | [RGB LED Grove module](https://www.pandabyte.in/product-page/rgb-led-grove-compatible) — fetched | RGB5050 | RGB/common-ground description; specification says 3.2–3.4 V while Product Info says 3.3/5 V and two colors through Grove; image + 3 thumbnails; reconcile voltage/operation claims. |
| 37 | [Grove 4-pin cable, 20 cm, 5 pack](https://www.pandabyte.in/product-page/grove-universal-4-pin-20cm-unbuckled-cable-5-pcs-pack) — fetched | WIREGROVE | 4-pin, 20 cm, five-piece pack; one image; no resource link exposed. |
| 38 | [xLoRa ESP32 LoRa board](https://www.pandabyte.in/product-page/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible) — browser fetch after timeout | XLORA | ESP32-WROOM-32, Wi-Fi/BLE and Ra-01H LoRa 803–930 MHz claims; battery/solar input values shown; image, count not captured; Product Wiki text and ESP32-WROOM-32E datasheet link. |
| 39 | [xC6 ESP32-C6 board](https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible) — fetched | ESPXC6 | 160 MHz, stated 8 MB flash, Wi-Fi and BLE 5.3; image + 2 thumbnails; Product Wiki text and Espressif datasheet link. |
| 40 | [xS3 ESP32-S3 board](https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible) — fetched | ESPXS3 | Dual-core 240 MHz, 16 MB flash/8 MB PSRAM, Wi-Fi/BLE 5 claims; image + 3 thumbnails; Product Wiki text and Espressif datasheet link. |
| 41 | [xC3m ESP32-C3 board](https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible) — fetched | ESPXC3M | RISC-V 160 MHz, 4 MB flash, Wi-Fi/BLE and peripheral claims; image + 3 thumbnails; Product Wiki text and Espressif C3-WROOM-2 datasheet link. |
| 42 | [Grove push-button switch](https://www.pandabyte.in/product-page/push-button-switch) — fetched | SWITCHGROVE | 3.3/5 V, contact resistance, 100k life and operating-force claims; image + 3 thumbnails; no resource link exposed. |
| 43 | [GP-02 GPS/BDS/GNSS Grove sensor](https://www.pandabyte.in/product-page/pandabyte-gp-02-gps-bds-gnss) — fetched | GPSGP02 | AT6558R/NMEA, UART up to 256000 bps and operating-temperature claims; image + 2 thumbnails; no resource link exposed. |
| 44 | [x32 ESP32 board](https://www.pandabyte.in/product-page/esp32-x32-microcontroller-board-arduino-compatible) — fetched | ESPX32 | ESP32-WROOM-32, Wi-Fi/Bluetooth and 3.3 V recommendations; image + 2 thumbnails; Product Wiki text and Espressif ESP32-WROOM-32E datasheet link. |

**Normalization notes:** SKU was visibly populated on 41 of the 43 rendered PDPs; it was not shown on the smart switch and AtomS3 Lite. The unavailable RGB Matrix page supplied no SKU. A “Product Wiki” text label did not expose a usable destination on the rendered pages. Some board pages link Espressif datasheets; BMV080 exposes tutorial/library/vendor links. Most simple modules expose no documentation link. The summaries above are page claims, not verified engineering values. Preserve nullable per-item fields and source URLs; do not turn empty fields into compatibility claims. Record manufacturer verification separately for chip, voltage/current, interface/protocol, connector/pinout, range/accuracy, dimensions, environment, host/firmware, kit contents and shipping data.

Suggested source schema: stable source ID/slug; title; SKU; brand/manufacturer; category assignments; visible/status; regular/sale price and currency; options/variants with per-variant SKU/price/stock; inventory/availability; descriptions; structured specs; explicit compatibility; included items and quantities; ordered images/videos with alt text and media IDs/URLs; documentation/tutorial links; shipping dimensions/weight; legacy URL for redirects; and evidence/verification source for every normalized spec. Confirm owner export fields before implementation.

## Cart / checkout observations

- Public cart flow tested in the live browser on 2026-10-23: adding the ₹60 LED opens a side cart; the cart shows subtotal ₹60, delivery ₹100 for India, total ₹160, then a warning that orders must be over ₹5,000 and asks to add ₹4,940. The Checkout control appeared as non-link text in the below-minimum cart state. This demonstrates that the ₹5,000 message is currently enforced in the public cart for this test case, not merely a decorative home banner.
- The ₹20,000 PandaPulse cart showed free delivery and a Checkout link. Checkout rendered a required customer/delivery-details form and an order summary before delivery/payment. We stopped before entering any details; provider, payment methods, tax/final totals, and order creation are unknown.
- Current-site behavior above is an audit observation. For the planned replacement, the user specified that the ₹5,000 minimum-order threshold should be shown and enforced only inside checkout; do not repeat it in the site header, product pages, or cart. The exact inclusive boundary, eligible subtotal calculation, and shipping interaction still need owner confirmation before checkout implementation.
- Another current inconsistency to reconcile: with a ₹60 item, India delivery was ₹100 in the cart and ₹160 total despite the site-wide ₹5,000 threshold warning. This may be expected shipping estimation, but the threshold and delivery calculations need a clear, consistent cart explanation.

## Public content gaps and issues observed

1. **Learning destination is broken/misleading:** footer “Explore Wiki Pages” resolves to the home page, not a wiki/library. PDP “Product Wiki” can be rendered as plain text without a link. The Help Center says guides/tutorials exist, but no discoverable lesson index was found in audited navigation.
2. **Courses storefront category is empty:** `/category/courses` explicitly has 0 products. Learning currently appears as FAQ/support copy, not a visible education catalog.
3. **Catalog discovery is shallow for electronics:** categories expose a price range/filter and Recommended sort, but no visible filter for MCU family, interface/protocol, operating voltage, sensor measurement, board format, compatibility, brand, or availability. That leaves SKU/model/spec search as a future content/data design need.
4. **Minimum-order message is ambiguous and shipping is surprising below threshold:** site header says ₹5,000 minimum, cart says orders “over” ₹5,000, and the ₹60 test cart also shows ₹100 India delivery while checkout is blocked. Define inclusive boundary, shipping rule, and clear add-to-threshold message.
5. **Office address formatting needs confirmation:** public footer/contact repeats “Hardwar, Haridwar” in one address string. Preserve the supplied spelling until the owner confirms the authoritative registered-office format.
6. **Kit contents deserve a consistency pass:** PandaPulse intro claims “21 Units” plus a free LED-SWITCH module; its visible bullet list has 17 rows, some of which include multiple cable quantities. This may be correct by unit count, but the included-item count should be explained/reconciled before reusing copy.
7. **Category totals are not additive:** 11 + 23 + 3 + 6 + 2 + 0 = 45, while All Products has 44. Confirm overlapping assignments and primary category when exporting.
8. **PDP content needs a product-data QA pass:** the x32 xLoRa HAT title/spec section says x32/xLoRa while Product Info names xC3m; the NodeMCU HAT Product Info also names xC3m despite its NodeMCU-specific compatibility text; TEMT6000 includes unrelated RGB-module copy; RGB LED voltage claims differ between specification and Product Info; and the RGB LED Matrix catalog card links to a product-not-found PDP. Verify before carrying those claims into the new catalog.

## Site media and other source URLs

The site’s observed images are served from Wix’s media CDN at `static.wixstatic.com/media/...`; the URLs below are live image variants referenced by public pages. They are examples only, not a complete asset archive. Keep the current PandaByte logo asset unchanged per project requirement; retrieve the authoritative source from the owner’s Wix Media Manager rather than redrawing it or treating a resized CDN variant as the master.

| Page/asset | Observed source URL |
|---|---|
| Exact current header panda logo | [Wix CDN logo](https://static.wixstatic.com/media/3e946a_0138368920914ac58cae712631817c05~mv2.png/v1/fill/w_130,h_142,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png), recorded from the home header's `pandabyte logo` image `srcset`; preserve the original mark unchanged. |
| Home hero | [Wix CDN image](https://static.wixstatic.com/media/3e946a_2372c11b61da418fb88c492c6b861979~mv2.jpg/v1/fill/w_520%2Ch_308%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/3e946a_2372c11b61da418fb88c492c6b861979~mv2.jpg) |
| Home IoT Kits panel | [Wix CDN image](https://static.wixstatic.com/media/3e946a_f6c9f399eeea4c0b984faf8f877be0b8~mv2.jpg/v1/fill/w_485%2Ch_287%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/3e946a_f6c9f399eeea4c0b984faf8f877be0b8~mv2.jpg) |
| PandaPulse PDP image | [Wix CDN image](https://static.wixstatic.com/media/3e946a_caf824008cba4dca983315b8ba0b09b9~mv2.jpeg/v1/fill/w_1169%2Ch_1280%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/3e946a_caf824008cba4dca983315b8ba0b09b9~mv2.jpeg) |
| Footer WhatsApp | [WhatsApp channel](https://whatsapp.com/channel/0029VaIceRtInlqNQBoRTC0J) |
| Footer YouTube | [PandaByte Innovations YouTube](https://www.youtube.com/@PandaByteInnovations) |

The home-page “Explore Wiki Pages” link was verified as `https://www.pandabyte.in/` (home page). No distinct public wiki/social community destination was found in the audited footer beyond the WhatsApp channel and YouTube channel above. Social destinations were identified, not content-audited.

## Wix migration evidence and backend boundary

**Observed publicly:** storefront behavior, product-card and PDP data, cart/checkout fields, Wix-style public routes, and images from `static.wixstatic.com`. These are public-facing fingerprints consistent with a Wix Store site. They do **not** disclose the private Wix database, dashboard, payment provider, installed apps, inventory source, automations, credentials, or customer/order records. None was accessed or inferred as a confirmed fact.

**Official Wix owner-side export guidance (requires authorized dashboard access):**

- [Export/import Wix Stores products](https://support.wix.com/en/article/wix-stores-exporting-and-importing-your-products): product CSV rows distinguish `PRODUCT`, `VARIANT`, and `MEDIA`; include handles, descriptions, category slugs, price/strikethrough price, media IDs/URLs, alt text, and other product fields. Media rows are separate and row order controls display order; categories have a separate CSV export. Wix’s documented import limits are 15 MB / 10,000 rows, so row count can exceed product count when variants and media are included. Confirm current dashboard version and export format before mapping.
- [Exporting Wix product list](https://support.wix.com/en/article/wix-stores-exporting-your-product-list): physical product exports support up to 5,000 rows per CSV; digital product export is not supported by this path. Product export requires access to the store dashboard.
- [Export Wix orders](https://support.wix.com/en/article/exporting-orders-3126323): owner-side export supports one row per line item or one row per order and optional columns; exported purchase times are UTC. The public documentation examined confirms export; it does not establish a native import path into a new non-Wix platform.
- [Export Wix contacts](https://support.wix.com/en/article/exporting-your-contacts): up to 50,000 contacts can be exported to CSV; only the site owner can export. Contact export should not be treated as proof that account credentials, consent/subscription history, or member passwords transfer.
- [Download Wix Media Manager files](https://support.wix.com/en/article/downloading-files-from-the-media-manager): uploaded images/videos can be selected and downloaded; Wix documents no one-click bulk download of all media, and free Wix/Shutterstock media cannot be downloaded. Verify asset ownership/licensing and preserve originals/alt text; public resized CDN URLs are not a complete backup.

**Migration recommendations:** obtain owner-authorized exports before content modeling; retain original handles/IDs and URL map for redirects; reconcile category counts, SKU/variant/stock, sale pricing, image ordering/alt text, and all technical claims against exports/PDPs; separately decide which orders/contacts/member records are needed and their lawful/consent-aware migration route; validate payment gateway, shipping/tax rules, refunds, and fulfillment with authorized owner documentation. Public research cannot answer these private backend questions.

## UX references for planning (pattern inspiration only)

The active site content/images should remain PandaByte-sourced; these links are references to public UX patterns, not sources for PandaByte copy or imagery. The user’s “Robo.in” wording is not assumed to mean Robu.in: the public site [robu.in](https://robu.in/) exists and identifies itself as Robu.in. Confirm whether that is the intended reference before using the name in project-facing copy.

- [Robu.in](https://robu.in/) exposes broad electronics catalog categories and visible customer-review, tutorial/video, and blog areas on its public home. Useful pattern: make category breadth, trust/review signals, and learning discoverable near shopping. Treat their review count/content as theirs; do not copy it.
- [Seeed Studio catalog](https://www.seeedstudio.com/Makers-Tools-c-2602.html) exposes product search and a support navigation including Wiki/Forum/FAQ. Its [search-experience article](https://www.seeedstudio.com/blog/2022/04/28/we-listen-and-take-action-7-smoother-and-richer-search-experience-now-available/) describes search suggestions and ranking signals including popularity, sales, and stock. Useful pattern: search by product phrase/SKU with relevance and availability, and place technical support/docs alongside the catalog.
- [Adafruit accessory catalog](https://www.adafruit.com/category/234) provides category-based discovery; [Adafruit support](https://www.adafruit.com/support) points users from product information to related learning guides and forums. Useful pattern: link every PDP to the relevant guide and a product-focused help path, with technical support clearly separated from order support.
- Proposed PandaByte facets: category/board family; MCU; wireless/connectivity; bus/protocol; operating voltage; Grove/header/connector; measured phenomenon; availability; price. Only expose facets when the underlying product data is verified. Add search by title/SKU/chip/model, sort by price/newest/availability, and persistent filter/reset controls. PDPs should foreground SKU, stock status, concise electrical/mechanical specs, pinout/datasheet/firmware files, compatibility, kit contents, and linked project/tutorials. Per the user’s future-site requirement, show/enforce the ₹5,000 order threshold only inside checkout, never in the header, PDP, or cart. Reviews should be added only if authentic review data and moderation/consent rules exist.

## Unknowns requiring owner-side validation

- Complete authoritative product export, including hidden/unpublished items, every variant/SKU/stock quantity, tax/shipping dimensions, full original descriptions, and category-primary assignments.
- Master media files, rights/licensing, original logo file, image alt text/display order, and whether all public Wix CDN assets are owner uploads.
- Actual checkout/payment provider(s), refunds, settlement, tax configuration, shipping zones/rates, minimum-order boundary (strictly greater-than or inclusive ₹5,000), and any order notifications/fulfillment connections.
- Public or unpublished wiki/tutorial/blog/course inventory and destination URLs; confirm whether product “Product Wiki” entries exist in CMS elsewhere or are unfinished links.
- Authoritative business/legal name, registered-office spelling, and approval of company-origin claims, current shipping/return/terms/privacy copy, and support contact details.
- Whether “Robo.in” in the user brief means [robu.in](https://robu.in/) or another business.

## Source URLs audited

Primary PandaByte pages: [home](https://www.pandabyte.in/), [about](https://www.pandabyte.in/about), [contact](https://www.pandabyte.in/contact), [help center](https://www.pandabyte.in/help-center), [all products pages 1–3](https://www.pandabyte.in/category/all-products), [dev boards](https://www.pandabyte.in/category/microcontroller), [sensors](https://www.pandabyte.in/category/sensors), [shields](https://www.pandabyte.in/category/shields), [accessories](https://www.pandabyte.in/category/accessories), [IoT kits](https://www.pandabyte.in/category/iot-kits), [courses](https://www.pandabyte.in/category/courses), [shipping/returns](https://www.pandabyte.in/shipping-and-returns), [terms](https://www.pandabyte.in/terms-and-conditions), [privacy](https://www.pandabyte.in/privacy-policy), [cart](https://www.pandabyte.in/cart-page), and the 44 linked PDPs listed above.

<!-- current-site-audit:end -->
