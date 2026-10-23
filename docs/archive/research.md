> Historical record saved during phase-zero consolidation on 23 October 2026. Earlier authorization, InsForge Auth recommendations and generation instructions below are superseded by [README.md](../../README.md), [design.md](../../design.md) and [plan.md](../../plan.md). Do not execute this record as a current task.

# Pandabyte.in — research and recommendations

Date: 23 October 2026 (Asia/Calcutta). Status: proposal for review; application implementation has not begun.

## 1. Confirmed brief

The public name is **Pandabyte.in**. The user selected an **engineering studio** direction: precise, spacious, and led by product photography. Both light and dark themes, accessibility, and purposeful animation are required. Latest visual steering replaces the earlier cyan palette proposal with Supabase-inspired neutral charcoal/white surfaces and restrained emerald/mint accents around the unchanged monochrome logo. Supabase is a visual reference only; InsForge remains the backend.

This is a company, commerce, and learning platform for students, educators, business buyers, and the IoT community. The first production release must support actual purchases and checkout. The requested system includes product catalogs, search, sorting, detailed product pages, customer accounts/authentication, product feedback, and an admin backend for products, pricing, and user management. Company pages, solutions, tutorials, blogs, upcoming products, open-source and proprietary projects, internships, and job openings belong in the planned information architecture.

Next.js and Vercel are preferences. **InsForge is confirmed for database and file storage, with custom application APIs.** India-first INR sales are confirmed. The ₹5,000 minimum remains and must be shown only inside checkout, before payment, with server enforcement. The existing logo must be reused without redesign. Razorpay and Stripe were proposed initially; Razorpay is now the recommended launch provider, pending merchant setup. AI agents and coding pipelines are a later phase; their exact customer and operator use cases are not yet defined.

## 2. Current site findings

The public catalog reports **44 products**. Categories cover development boards, sensors, shields, accessories, and IoT kits; a Courses category also exists. These are a public snapshot, not a reconciled inventory export. [Catalog](https://www.pandabyte.in/category/all-products)

The homepage is strongly store-led. It exposes a ₹5,000 minimum order and a panda identity with cyan accents. A browser review at the available roughly 923 px viewport showed horizontal overflow and a crowded header; this observation is limited to that viewport. The company and learning proposition deserves more visibility in the revamp. [Homepage](https://www.pandabyte.in/)

The About page identifies Pandabyte Innovations Private Limited and describes an education/research focus. Founder affiliations stated there are company claims to reconfirm before prominently reusing them. “Joyting” was not found on the reviewed public pages; the user's latest brand confirmation takes precedence. [About](https://www.pandabyte.in/about)

Three concrete content problems precede visual redesign:

1. The Courses category reports no products. A learning destination needs actual material and a clear owner. [Courses](https://www.pandabyte.in/category/courses)
2. “Explore Wiki Pages” resolves to the homepage in the extracted link map, while a sampled product's “Product Wiki” label had no verified destination. Resolve those paths before migration. [PandaPulse product](https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit)
3. Public FAQs mention tutorials and support, but a published tutorial/blog index was not discoverable in the reviewed navigation. A FAQ promise is not evidence of an existing content library. [Help Center](https://www.pandabyte.in/help-center)

Further work: verify current price/stock, the subtotal used for the minimum-order calculation, tax treatment, shipping and returns, complete product specifications, image originals, and old URL mappings. See [the inventory](../../docs/content-inventory.md).

The expanded audit individually checked all 44 catalog-linked product URLs: **43 product bodies rendered and one RGB LED Matrix route showed a product-not-found state**. It also found product-copy inconsistencies involving shield compatibility, a light-sensor description, and RGB voltage wording. These require owner/manufacturer confirmation before migration. Public cart tests showed the minimum blocking a ₹60 cart and a ₹20,000 kit reaching the customer-details step; the test ended without personal details or an order. Exact coverage and source links are in [current-site findings](../../current_pandabyte_findings.in).

## 3. Recommended experience

Use a shared shell with **Shop, Solutions, Learn, Company**, a prominent product search, account/cart controls, and a theme control. Put careers and internships within Company; put tutorials, blog, and open-source projects within Learn. Final labels remain reviewable. A future community hub does not automatically mean a forum or social network.

The homepage should establish the company, demonstrate real hardware, and guide visitors toward buying or learning. Product cards should prioritize a clear photo, model name, compatibility summary, price, and stock state. Product detail pages should make specifications, included components, documentation, delivery information, and feedback easy to scan.

For an electronics catalog, search correctness is more important than visual novelty: an exact SKU such as `xC3KITV2` or model such as `ESP32-C3` should outrank loosely related text. Filters should reflect verified product data. Sorting should be predictable and reflected in shareable URLs. See [design plan](../../docs/design-plan.md) and [search architecture](../../project.md).

## 4. Frontend recommendation

Propose **Next.js App Router + TypeScript + Tailwind CSS + selected shadcn/ui components + Heroicons**. Use semantic HTML and CSS transitions first, adding **Motion** only for approved interactions that benefit from it. This provides a consistent implementation without combining several competing UI kits. These application repositories are MIT-licensed at the reviewed source level; package-level and transitive licenses still need a pinned dependency audit. [Resource ledger](../../docs/resources.md)

Server-render public product and content pages. Keep interactive islands small: search/filter controls, gallery, quantity selection, cart, and account forms. The theme should follow the system preference initially with an explicit light/dark choice; the final default is a design decision.

Current proposed visual direction: near-white and charcoal surfaces, a restrained emerald/mint accent, large real product photos, legible technical tables, and mono typography only for model numbers/specifications. This supersedes the earlier cyan/teal palette proposal. Logo preservation is a confirmed requirement; on dark surfaces, use a suitable light backing without recoloring or redrawing the mark. Supabase is a visual reference only, not a backend choice.

## 5. Backend decision and evaluated alternatives

The admin and ready-to-sell requirements justified comparing reusable commerce foundations. The user subsequently selected InsForge and custom APIs. Retain this comparison as evidence, not as an unresolved vendor choice:

| Path | Why consider it | Main tradeoff |
| --- | --- | --- |
| Next.js + Medusa commerce — evaluated, not selected | Reuses commerce domains and an operations admin | Adds a separate commerce backend; Razorpay integration requires validation |
| Next.js + Payload — evaluated, not selected | Strong content/admin fit across company pages, jobs, articles, and catalog | Official ecommerce template is beta and would introduce another backend model |
| Next.js + InsForge — selected direction | Matches the explicit database/storage preference and custom API approach | Commerce state and the business admin require significant application work |

Use InsForge as the data authority, custom Next.js server APIs for business operations, and a custom admin in the same application. Propose InsForge Auth to avoid a second identity system. Reuse proven UI components and provider SDKs rather than importing a whole commerce engine. A CMS is not automatically a complete commerce engine, and a backend service is not automatically a store admin. See [project architecture](../../project.md).

Prisma is compatible with InsForge Cloud's documented direct PostgreSQL endpoint, but is **not recommended initially**. That connection uses privileged `postgres` credentials and bypasses RLS; the reviewed documentation did not establish pooled runtime connection guidance. Prefer InsForge's typed SDK plus reviewed SQL migrations and transactional database functions. Reconsider an ORM only with validated least-privilege access, pooling and one migration owner. [InsForge connection details](https://github.com/InsForge/InsForge/blob/main/docs/faq.mdx)

## 6. Payments and operational readiness

For the confirmed India-first launch, Razorpay is the leading candidate pending merchant account eligibility. Its integration requires server-created orders and signature verification. Stripe remains an alternative: its current India availability is invite-only. Do not assume an account can be activated or that all local payment methods are available. [Razorpay integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Stripe India availability](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india?locale=en-GB)

Use one provider initially. A browser success callback must not trigger fulfillment on its own. Verify payment state server-side; reconcile delayed and duplicate events; protect stock from concurrent purchases; and retain auditable order and refund records. Payment, shipping, tax, invoice, cancellation, and minimum-order rules must be settled before implementation of checkout.

Admin scope must include operational work, not only visual editing: publication, price/stock changes, order/payment status, fulfillment tracking, moderation, and permitted customer support actions. Role permissions and audit history are part of this scope.

## 7. Open-source selection rules

Prefer MIT components with maintained releases, understandable code, relevant documentation, and demonstrated adoption. Stars and forks are supporting evidence, not proof of security or suitability. Record the exact tag/commit and license when adopting code. Hosted services, paid extensions, fonts, photos, and trademarks have separate terms.

The implementation shortlist includes shadcn/ui, Radix where required by the chosen components, Tailwind, Heroicons, and optional Motion. Meilisearch's MIT community portion is a later search option. Medusa and Payload remain references. Lucide is ISC and Typesense is GPL, so neither is an MIT match for this brief. A commercial storefront template should not be copied just because its underlying component library is MIT.

The explicitly selected InsForge is Apache-2.0, not MIT. TypeScript and Prisma also use Apache-2.0; PostgreSQL uses its own permissive license. These must be labeled honestly rather than describing the entire stack as MIT. The user's latest explicit InsForge choice takes precedence over the earlier generic MIT preference. [InsForge license](https://github.com/InsForge/InsForge/blob/main/LICENSE)

For skills, use the existing UI/UX Pro Max, Superdesign, and Ponytail workflows. Consider Vercel's React/design guidelines and the reviewed content-strategy skill for later implementation/editorial work. Avoid installing overlapping skill collections indiscriminately. [Detailed repository and skill evidence](../../docs/resources.md)

## 8. Tool readiness and research method

- Three research agents ran on `gpt-6-luna` with `xhigh` reasoning: site audit, architecture, and design/resources. They were assigned follow-up checks after the scope expanded.
- The current orchestrator model is controlled by the chat configuration. No tool was used to change or falsely verify its model setting.
- Superdesign CLI v0.14.0 authenticated successfully with the existing local account. A plugin-directory search returned no Superdesign plugin; the installed skill uses its supported CLI.
- Superdesign model availability was inspected. Its model list differs from Codex's agent list; do not assume the requested orchestrator model is available on that canvas.
- GitHub and Vercel connectors are available. GitHub was used to inspect repository material. Vercel documentation search returned weakly related examples, so conclusions rely on targeted official documentation instead.
- Public pages and one rendered homepage viewport were reviewed. No private Wix CMS, customer records, live payment flow, or full mobile/accessibility audit was inspected.
- The user subsequently requested a full current-site audit using Firecrawl. Official CLI/skills were inspected; CLI v1.26.22 was unauthenticated and its keyless scrape rejected the network as VPN/proxy. No Firecrawl content capture completed. Public-source/browser evidence and exact coverage limits are documented in [current-site findings](../../current_pandabyte_findings.in) and mirrored in README. A full private backend inspection is unavailable without authorized Wix access. [Official Firecrawl CLI](https://github.com/firecrawl/cli)

## 9. Decisions still needed

Resolved in chat: InsForge database/storage, custom APIs, India-first, ₹5,000 minimum at checkout only, and unchanged existing logo. The selected style is an engineering studio with Supabase-inspired neutral charcoal/white surfaces and restrained emerald/mint accents. Supabase is a visual reference only. Final page compositions and motion remain design candidates for review.

Before checkout work: merchant account readiness, whether the minimum is measured before/after discounts and taxes, shipping provider/rates, tax/invoice rules, returns/refunds, guest checkout versus mandatory account, catalog scale, expected traffic, and monthly operating budget.

Before content/admin work: staff roles; content approval process; review eligibility/moderation; application handling for jobs; authoritative wiki/repository URLs; what customer analytics “track users” means. Propose aggregate commerce analytics and authorized customer/order lookup, not an undefined surveillance capability.

## 10. Next review

The user selected Superdesign as the sole tool for current design generation/review and requested agent-assisted work plus a visible preview. The latest request explicitly authorizes expanding the homepage direction into all 19 prepared sibling screens. OpenDesign setup from the earlier request is retained as history; no OpenDesign brief confirmation is required. Production application implementation remains a separate, unauthorized phase. Actual links, source provenance, coverage and browser evidence are recorded in [design delivery](../../docs/design-delivery.md).

No Git initialization, commits, app scaffolding, provider provisioning, GitHub publication, or deployment belongs to this checkpoint.
