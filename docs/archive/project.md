> Historical record saved during phase-zero consolidation on 23 October 2026. Earlier authorization, InsForge Auth recommendations and generation instructions below are superseded by [README.md](../../README.md), [design.md](../../design.md) and [plan.md](../../plan.md). Do not execute this record as a current task.

# Pandabyte.in — project brief and development handoff

Updated: 23 October 2026, Asia/Calcutta.

## Current checkpoint

**Latest requests authorize Superdesign design generation for all 19 prepared screens, agent-assisted work, and a visible preview. The current visual reference is Supabase's neutral charcoal/white surfaces with restrained emerald/mint accents, chosen around the unchanged monochrome logo.** Supabase is a visual reference only; InsForge remains the backend direction. Production application implementation, Git initialization, backend provisioning, publication and deployment remain outside this phase. Use only existing Pandabyte.in content/images and preserve the existing logo.

Read [research.md](../../research.md) for evidence, [AGENTS.md](../../AGENTS.md) for agent working rules, [design plan](../../docs/design-plan.md) for page families and proposed tokens, [resources](../../docs/resources.md) for licenses/repositories, and [content inventory](../../docs/content-inventory.md) for migration sources. The separately requested [current-site findings](../../current_pandabyte_findings.in) records crawl coverage and checkout observations.

## 1. Product and confirmed scope

Build a professional company, commerce, and learning website for **Pandabyte.in**, replacing its Wix implementation. Serve students, educators/institutions, business buyers, and the IoT community. Keep real product information and imagery grounded in the existing site.

| Area | Confirmed requirement | Implementation details still proposed |
| --- | --- | --- |
| Identity | Preserve the exact existing monochrome panda logo; precise, spacious engineering studio with Supabase-inspired neutral surfaces and restrained emerald/mint accent | Typography, spacing, animation, page compositions |
| Accessibility | Responsive, accessible light and dark modes | WCAG 2.2 AA target, system-first theme default |
| Commerce | Production-ready purchases and checkout at first production release | Razorpay recommended; merchant onboarding and shipping/tax rules unresolved |
| Market | India-first; ₹5,000 minimum shown only inside checkout | Determine whether eligibility uses subtotal before/after discounts, taxes, or shipping |
| Catalog | Product listings, detailed descriptions, search, sorting, more products | Filters depend on verified structured data; exact variant rules require export |
| Accounts | Authentication and user management | InsForge Auth recommended; guest checkout policy and login methods unresolved |
| Admin | Control products, listings, pricing, users, and site content | Roles, publication workflow, order/stock operations proposed below |
| Feedback | Product comments or feedback | Moderated product reviews recommended; verification and eligibility need a decision |
| Company | About, contact, solutions, upcoming products | Publish only confirmed services and future-product information |
| Content/community | Blog, tutorials, open-source and proprietary work | Public curated project hub first; forum, LMS, paid content, and discussion systems need separate scope |
| Careers | Internships and openings | Listing/detail pages; application submission method and retention unresolved |
| Future AI | Agentic features and coding pipelines later | No autonomous commerce/admin actions or production coding agents in the launch scope |

## 2. Recommended stack

| Layer | Selection or recommendation | Purpose and constraint |
| --- | --- | --- |
| Framework | Next.js App Router + React + TypeScript | One codebase for public pages, account/admin UI, and custom APIs |
| Styling | Tailwind CSS with semantic CSS variables | One design system across light/dark modes |
| UI | Selected shadcn/ui components and their chosen primitive base | Own the source; avoid installing a second competing component kit |
| Icons | Heroicons | MIT alternative to ISC-licensed Lucide |
| Animation | CSS first; optional Motion | Small purposeful transitions with reduced-motion behavior |
| Database | InsForge-managed PostgreSQL — user confirmed | Authoritative catalog, content, identity-linked records, and commerce data |
| File storage | InsForge Storage — user confirmed | Product media and documents; private files separated from public assets |
| APIs | Custom Next.js Route Handlers/server services — user confirmed | Validation, authorization, commerce rules, and provider integration |
| Authentication | InsForge SSR integration — recommended | One customer/staff identity source; role checks stay server-controlled |
| Data access | InsForge typed SDK + SQL migrations/RPC — recommended | User-scoped reads; atomic multi-step commerce operations |
| Payments | Razorpay for India-first launch — recommended | Test/live separation; server-calculated INR amounts in paise |
| Search | PostgreSQL full-text + exact model/SKU matching; `pg_trgm` if enabled | Indexed server queries initially; Meilisearch CE only when measured needs justify it |
| Content editing | Custom admin using the same InsForge data | Structured sections, draft/publish, media and SEO fields; no additional CMS by default |
| Validation | Zod or existing platform validation | Validate all external input; confirm final package choice at scaffold time |
| Tests | Vitest + Playwright recommended | Unit/integration tests for domain rules; browser tests for core journeys |
| Hosting | Vercel — user preferred | Region aligned with the chosen InsForge region; separate preview/staging data |

Pin compatible stable versions when scaffolding; do not commit floating `latest` dependencies. The software shortlist favors MIT, but InsForge/TypeScript are Apache-2.0, PostgreSQL uses its own permissive license, and Playwright is Apache-2.0. Preserve and record these exceptions honestly.

### Prisma decision

**Do not add Prisma initially.** InsForge Cloud documents direct PostgreSQL access and explicitly mentions Prisma compatibility. However, the documented connection uses privileged `postgres` credentials and bypasses RLS. The reviewed evidence did not establish a pooled runtime endpoint or safe connection budget for Vercel workloads. [InsForge FAQ](https://github.com/InsForge/InsForge/blob/main/docs/faq.mdx)

Use the SDK for ordinary reads/writes and SQL/RPC for transactions. Reconsider Prisma only after validating a least-privilege role, request authorization/RLS behavior, pooling, runtime compatibility, and one migration owner. Prisma also uses Apache-2.0. Typed models alone do not justify two data-access and migration systems. [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [Vercel deployment guidance](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/serverless/deploy-to-vercel)

## 3. Architecture and data boundaries

Use a modular monolith: one Next.js application and one authoritative InsForge backend. Public pages read published data. Private account/admin pages verify sessions server-side. Custom APIs own business operations. Keep provider secrets and administrative InsForge clients server-only.

Use explicit server modules for catalog, checkout/orders, identity/permissions, content/careers, reviews, and media. Route Handlers and Server Actions are public entry points; each mutation requires validation and authorization. Do not rely on hiding a UI control. [Next.js data security](https://nextjs.org/docs/app/guides/data-security)

### Proposed entities

| Domain | Records and important constraints |
| --- | --- |
| Identity | Auth-managed users; public-safe profiles; server-managed staff role grants |
| Catalog | Products, variants/SKUs, categories, product-category links, ordered media, typed specification fields, resource links |
| Pricing | INR prices in integer paise, valid sale periods if approved, revision/audit information |
| Stock | Inventory per sellable SKU, reservations with expiry, inventory movements |
| Shopping | Carts and lines; server-bound ownership; quantity and stock validation |
| Orders | Orders, immutable line/price/address/tax snapshots, lifecycle history |
| Payment | Payment attempts, unique provider IDs/events, refunds, reconciliation status |
| Content | Pages, articles/tutorials, solutions, projects, upcoming products, published revisions |
| Careers | Openings and internships; application records only after application flow is approved |
| Feedback | Product-linked reviews, author, moderation state; verified purchase only when backed by an eligible order |
| Operations | Contact inquiries, shipping/fulfillment tracking, admin audit events, controlled site settings |

This is a conceptual model, not a final SQL schema. Confirm variants, stock locations, taxes, and return workflow before writing migrations. Do not modify InsForge's managed `auth`, `storage`, or `payments` schemas as application tables.

### Data/security rules

- Anonymous reads return only published catalog/content and approved reviews.
- Customers access their own private records; staff permissions are explicit and server-controlled.
- Separate product media from private inquiries/applications. Use private buckets and expiring authorized links for private files.
- Add grants and RLS, not merely client filters. Keep admin keys out of `NEXT_PUBLIC_*` values.
- Validate uploads by size/type and permissions. Sanitize rich content; do not evaluate arbitrary CMS code or render unsanitized HTML.
- Keep order/payment state separate from fulfillment state. Record administrative price, stock, refund, and role changes.
- Store timestamps in UTC; display business-facing dates in the appropriate timezone, normally Asia/Calcutta.
- Back up database **and** storage; test a restore. InsForge's documented database backup coverage excludes stored files. [Backup documentation](https://docs.insforge.dev/core-concepts/database/backups)

## 4. Search, filtering, and optimization

### Proposed search ranking

1. Exact SKU/model match.
2. Normalized model alias/prefix match, preserving technical identifiers.
3. Product-title match.
4. Structured category/specification match.
5. Description full-text and controlled typo fallback.

Do not run embeddings for basic SKU lookup. Preserve originals and normalize cautiously so `ESP32-C3` does not lose its distinguishing suffix. Start with category, price, and availability filters; add voltage/protocol/interface/compatibility only when complete, verified data supports them. Distinguish supply voltage from logic voltage.

Use allowlisted sort modes (relevance, newest, price ascending/descending), parameterized queries, bounded page sizes, stable ID tie-breakers, URL query state, and debounced cancellable typeahead if approved. Never download the entire catalog to the browser for routine searching. [PostgreSQL text search](https://www.postgresql.org/docs/current/functions-textsearch.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

Index publication/category/SKU/filter/sort paths based on real query plans. Full-text and similarity indexes are proposals pending InsForge extension support. Establish search fixtures covering exact SKUs, hyphenated chip names, empty results, typo fallback, and combined filters. Add a dedicated search service only after measuring catalog size, latency, relevance, and operational cost.

Cache public catalog/editorial reads with deliberate invalidation after publication or price changes. Never share-cache account, admin, private orders, or checkout totals. Recheck authoritative price and stock during checkout. Use responsive images with intrinsic dimensions; prioritize the main visual and lazy-load the remainder. Bound database projections to needed columns and page sizes.

## 5. Commerce and checkout contract

The ₹5,000 rule appears **inside checkout only**, before any payment action. Display the eligible subtotal and amount still needed when below the minimum. Do not repeat the current homepage banner in the new design. The basis of the subtotal must be agreed before implementation. The server must enforce the same rule regardless of client state.

Proposed purchase flow:

1. Read current sellable variants/prices server-side; validate quantities, availability, market, and shipping details.
2. Calculate authoritative totals and eligibility, including the minimum-order rule. Persist an order snapshot and stock reservation atomically.
3. Commit the database transaction, then create the provider order. Never hold a stock lock while waiting for Razorpay.
4. Open Razorpay Checkout using the server-created payment attempt. Verify callback/provider state on the server.
5. Handle verified webhook events idempotently; update payment and order state once. A browser redirect is not proof of payment.
6. Reconcile delayed or out-of-order events. Expire/release reservations on failures/timeouts, with an explicit policy for late successful payments and unavailable stock.
7. Fulfill once payment policy permits; send confirmation from a durable event/outbox path. Support refund and cancellation history.

InsForge has a built-in Razorpay integration. Prefer it where it satisfies the custom API's trust boundaries, but explicitly validate amount authorization, callback verification, webhook ownership, event-to-order mapping, retries, refunds, and stock effects. Do not implement a second competing webhook owner by accident. The application's order tables remain authoritative business records; provider projections are reporting/integration data. [InsForge Razorpay](https://docs.insforge.dev/core-concepts/payments/razorpay), [Razorpay verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Webhook validation](https://razorpay.com/docs/webhooks/validate-test/)

Checkout implementation is incomplete until failure, cancellation, duplicate submission, duplicate webhook, concurrent stock, price change, abandoned reservation, late success, and refund cases pass.

## 6. Admin and editorial requirements

Propose a custom `/admin` area with role-controlled catalog/media/pricing/inventory management; orders/payments/refunds/fulfillment; customer support lookup; review moderation; pages/tutorials/blog/projects; careers; site navigation and SEO fields; and an audit trail.

Begin with structured editable sections. A freeform drag-and-drop page builder, visual workflow designer, advanced CRM, and arbitrary plugin marketplace are not implied by “customizable.” Add them only if requested later. Define staff roles before implementation; a reasonable proposal is administrator, catalog/operations, and editor with narrower permissions.

Reviews should distinguish pending, published, rejected, and reported states. Public ratings must derive from real published reviews. Whether only purchasers can review, whether a rating is required, and whether text comments exist separately are unresolved. Do not fabricate reviews.

“Track users” currently means a requested capability requiring definition. Propose order/customer support views and aggregate funnel metrics first. Decide analytics provider, consent behavior, retention, and access before implementation. No session replay or private applicant/customer data in analytics by default.

## 7. Skills, MCPs, and agent workflow

| Capability | Use |
| --- | --- |
| Ponytail | Every development task: inspect callers, reuse patterns, smallest complete diff, meaningful checks |
| UI/UX Pro Max | Design critique, hierarchy, image-led layouts, responsiveness, accessibility |
| Superdesign | CLI authenticated; homepage v5 generated and checked; latest request authorizes generation of all 19 prepared sibling screens; see docs/design-delivery.md |
| InsForge / InsForge CLI | SDK/SSR, RLS/storage, SQL migrations/RPC, later project connection and staging |
| InsForge Debug | Diagnose actual backend failures when needed |
| Vercel React Best Practices / Verification | Component review and end-to-end browser/API/data checks |
| Vercel CLI / Deployments / Env Vars | Only during authorized hosting setup and deployment |
| GitHub connector | Read primary repo evidence; later issues/PRs/publication within authorization |
| Vercel connector | Official docs and later configured project/deployment inspection |
| Browser tools | Responsive, keyboard, cart and checkout journey verification |
| Find Skills + reviewed Vercel/content skills | Selective guidance; inspect source and license before installing |
| Firecrawl official CLI/skills | User-requested current-site research; unauthenticated attempt blocked, see audit report for fallback coverage |

InsForge's public docs describe CLI/MCP setup; no project is connected or created here. Prefer its supported CLI in this environment unless an appropriate MCP connection is actually available. Development MCP access is separate from shipping an AI assistant to customers. Firecrawl's core server is AGPL-3.0 and is a research tool here, not a proposed application dependency. Its map/crawl require authentication; the keyless scrape was rejected by the network policy. Do not claim Firecrawl scraped pages when it did not.

For parallel work after review, assign independent bounded tasks (public UI, backend/schema, content migration, verification) with explicit file ownership. Root owns integration and schema/API contracts. The requested research agents used Luna at extra-high reasoning; model settings must be reported truthfully and may depend on the environment. Do not spawn additional agents just to duplicate checks.

## 8. Proposed repository structure — do not create yet

```text
Pandabyte/
  AGENTS.md
  project.md
  research.md
  current_pandabyte_findings.in
  README.md
  docs/                         # design, resources, migration evidence
  public/brand/                 # exact approved logo
  src/
    app/
      (public)/                 # company, catalog, learning, careers
      (account)/                # authenticated customer pages
      admin/                    # staff UI
      api/                      # custom HTTP boundaries
      globals.css               # light/dark semantic tokens
    components/                 # shared shell, product UI, selected primitives
    server/                     # business services and authorized data access
    lib/                        # small shared utilities and validation
  insforge/migrations/          # proposed single SQL migration owner
  tests/                        # domain/integration + browser journeys
```

Use one package manager and lockfile. Add directories only when used. Respect the real scaffold's supported InsForge migration path rather than forcing this illustrative name. No monorepo, microservices, extra ORM, or worker fleet without a concrete requirement.

## 9. Delivery plan after review

| Phase | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — current | Research, scope, agent rules, source audit | User reviews files; no initialization |
| 1 — design | Sitemap/flows, tokens, homepage and product-detail drafts, then page families and admin | Reviewed desktop/mobile light/dark designs, real logo/media, agreed states |
| 2 — foundation | Authorized Git/app init, pinned stack, connected staging backend, auth/roles, tokens | Typecheck/build, RLS role matrix, accessible shell, environment separation |
| 3 — catalog/content | Product import, indexed search/filter/sort, pages/blog/tutorials/company/careers, editorial admin | Reconciled records/media, permissions, query/search tests, preview/publish |
| 4 — commerce | Cart, checkout/minimum, payment verification, reservations, orders/refunds/fulfillment | Test-mode full purchase and failure matrix, concurrency and idempotency tests |
| 5 — launch readiness | Feedback moderation, migration redirects, SEO, accessibility/performance, backups, monitoring | Reviewed content, restore check, core journeys, production configuration |
| 6 — launch | Authorized Vercel cutover and operations handoff | Domain/redirect/payment smoke checks and rollback plan |
| Later | Approved community and AI capabilities | Separate use cases, data permissions, budget, evaluation and human controls |

Checkout remains part of the first production release even though its implementation follows catalog development. Do not mistake an intermediate catalog preview for a launch-ready store.

After Git is authorized, commit each coherent change with verification evidence; examples: documentation baseline, design tokens/shell, catalog/schema/search, checkout/stock, moderation/admin, migration/launch. Never claim commits before they exist.

## 10. Acceptance criteria and unresolved inputs

Acceptance requires real product content with no invented specifications; responsive light/dark pages; unchanged logo; accessible navigation/forms/dialogs/tables; correct search and combined filters; protected customer/admin records; and a working India purchase flow including the checkout-only minimum. New content sections publish only when real content exists; empty states must be honest.

Quality targets: WCAG 2.2 AA checks with keyboard and assistive-technology review, no horizontal overflow at 320/768/1024/1440 px, meaningful browser coverage, and measured Core Web Vitals on realistic product pages. Lighthouse scores are a diagnostic, not proof of accessibility or production performance. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

Resolve before the relevant work: minimum subtotal definition; guest checkout; authentication methods and staff roles; GST/invoices and shipping/rates; refund/return policy; merchant account readiness; expected scale/budget; careers application flow; review rules; content editors; verified wiki/repos and upcoming-project details. These do not block documentation completion.

## 11. Reusable agent kickoff prompt

> Work on Pandabyte.in using AGENTS.md, project.md, research.md, and the relevant docs. The latest authorized phase is Superdesign-only design generation for all 19 prepared screens, with agent assistance and a visible preview requested. Use Supabase only as a visual reference: neutral charcoal/white surfaces and restrained emerald/mint accents around the unchanged monochrome logo; InsForge remains the backend. Use only existing Pandabyte.in content/images. The architecture direction remains Next.js, InsForge database/storage, custom server APIs, accessible engineering-studio light/dark UI, and the checkout-only ₹5,000 rule. Treat final layouts as design candidates; production implementation is not authorized. Keep source content traceable, retain license notices, and keep private data/credentials out of files. Coordinate bounded agents without overlapping file ownership. Create reviewable design pages now; do not initialize Git/the application, provision a backend, publish, or deploy until a later user instruction.
