# PandaByte.in

An India-first IoT hardware catalog and company website with an editable administration backend.

**Status: hosted development preview, 29 October 2026.** [Open PandaByte](https://pandabyte-iot.vercel.app). The site uses the selected development Clerk/InsForge services. It is not a production-commerce launch; real payments and invoice issuance remain disabled/deferred. [Deployment and checks](docs/vercel-preview-deployment.md).

**Local test-commerce, 30 October 2026:** localhost:3000 now supports explicitly configured Razorpay TEST checkout, owner-approved provisional tax/shipping totals, paid-test PDF bills and shared customer/Admin fulfillment tracking. Live payments, emails and real tax invoices remain off; the hosted preview was not payment-enabled. [Scope, setup boundaries and verification](docs/storefront-test-checkout.md).

## Implemented

- Responsive storefront, product search/filtering, product galleries, cart and signed-in checkout review.
- Supabase-inspired frontend palette, static hero and shared accessible actions; Admin uses an independent Supabase preset with Outfit typography. [Theme scope](docs/frontend-theme.md).
- Company, solutions, learning, blog, FAQ and contact page families backed by published CMS records.
- Clerk sign-in and account pages for profile, addresses, favorites, orders, settings and Billing.
- Fictional invoice-template preview and downloadable sample PDF, clearly marked **SAMPLE — NOT A TAX INVOICE**.
- Private order-specific **TEST — NOT A TAX INVOICE** PDFs for paid Razorpay test orders, available to their customer or authorized Admin.
- Role-based Admin editing for products, categories, pricing, inventory, orders, inquiries and company/editorial content.
- Draft/published revisions, version guards, private media, ownership checks and InsForge row-level security.
- Contact abuse protection, prepared inquiry notifications, bounded diagnostics and development accessibility checks.

The development catalog has 42 imported SKU-bearing products; two source products remain held for missing SKUs. Captured source prices and unverified stock do not establish production availability. Content and data live in the configured backend, not in a database dump in this repository.

## Stack

| Layer | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript; root `app/` directory |
| Styling | Tailwind CSS, CSS modules, accessible Radix primitives, Lucide and retained third-party notices |
| Identity | Clerk; InsForge verifies Clerk subjects for data access |
| Backend | InsForge PostgreSQL, storage, reviewed SQL migrations/RPC and application Route Handlers |
| Hosting | Vercel hosted development preview; production-commerce release gates remain open |

Exact dependency versions and overrides are pinned in `package.json` and `package-lock.json`. InsForge is the single data authority; Clerk is the sole identity/session provider.

## Local setup

Use Node.js **24.x** and the npm version recorded in `package.json`.

```sh
npm ci
```

Copy `.env.example` to `.env.local`, then configure an approved development Clerk application and InsForge project. On PowerShell:

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Empty environment placeholders are intentional: private routes require a real active session and a verified backend identity bridge. Service-dependent features remain unavailable until their configuration and migrations are ready.

- Keep all secrets in ignored local configuration or the selected provider's secret store.
- Never put administrative, signing or database credentials in `NEXT_PUBLIC_` variables.
- Use the backend setup guide and reviewed migration history for a new environment; do not apply service-changing scripts to an existing project blindly.
- Commerce simulation and Razorpay test flags default to `false`. Provider credentials belong in InsForge; no live keys are included.
- Local Turnstile test keys are for loopback testing only. Production protection requires real domain configuration.

See [backend setup](docs/backend-setup.md), [account contracts](docs/account-dashboard.md), [Admin roles](docs/admin-roles.md) and [operational readiness](docs/phase-6-operational-readiness.md).

## Checks

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

Unit tests use fixture data. Tests that reconcile the owner-only catalog/CAD archive explicitly skip when that local archive is absent; fixture-based importer and GLB validation tests still run. Backend/browser integration scripts require approved development services and may create disposable records. They are separate commands and must not be run against production by default.

Existing browser evidence and manual limits are recorded under `docs/verification/`. DOM/viewport checks do not prove screen-reader speech, genuine browser zoom or OS reduced-motion switching.

## Repository layout

```text
app/          Next.js routes, pages and API handlers
components/   Storefront, account, Admin and shared UI
lib/          Validation, authorization and business/data access
migrations/   Reviewed InsForge PostgreSQL migration history
public/       Runtime assets and the fictional invoice sample
scripts/      Explicit maintenance/import and validation tools
tests/        Unit fixtures and separately authorized integration checks
docs/         Contracts, provenance, verification and runbooks
.agents/      Selected repository-local development guidance
```

Raw product captures, CAD experiments, models pending redistribution permission, local Superdesign sessions, tool binaries, credentials and generated build output stay local and are ignored. The public app obtains authorized published media through its backend. Archive/model preparation scripts require the separately maintained local source archive; it is not part of a fresh public clone.

## Remaining release work

- Approved production catalog/content and media rights, real stock, shipping policy, GST/HSN/rates and merchant legal information.
- Production identity/data configuration, secrets, real Turnstile protection and verified notification delivery.
- Real checkout/payment enablement and durable, legally approved invoice numbering/issuance; template previews do not issue invoices.
- Capacity/load tests, monitoring ownership, recovery targets and an isolated restore rehearsal.
- Remaining manual accessibility checks and the production-release gate.

Historical simulated/provider-test payment evidence is retained in the docs; it does not enable normal or live purchases. The hosted preview does not resume payments, content mutation, live email, load testing or restore operations. Contact message sending stays unavailable until real Turnstile domain keys and its server-side submission proof are configured.

## Project records

- [Phased plan](plan.md) and [design contracts](design.md).
- [Public-site source findings](current_pandabyte_findings.in) and historical planning in `docs/archive/`.
- [Development tooling](docs/development-tooling.md), [third-party resources](docs/resources.md) and notices under `docs/licenses/`.
- [Billing/template review](docs/invoice-template-review.md) and [publication checks](docs/public-repository-checkpoint.md).

The README is the current project overview. Dated development records describe the scope verified at that time; they are not blanket authorization for later operations or guarantees of production readiness.

## Rights

No repository-wide open-source license is granted by this publication. PandaByte branding, product content and third-party assets retain their respective rights. Third-party source, dependency and asset notices are preserved; public repository visibility does not relicense them.
