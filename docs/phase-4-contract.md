# Phase 4 implementation contract

24 October 2026. The owner authorized dependency remediation first, then Phase 4 with Luna xhigh workers, selected Superdesign layouts, built-in-browser checks, fixes and a local commit. The dependency gate must pass before implementation. Production provisioning/deployment, checkout/payments and Phase 5 remain separate.

## Published data and routes

- Keep Clerk identity, existing private account/staff permissions, and one InsForge data authority. Anonymous public clients read only capability-independent, published projections. Public reads remain `no-store`; request-scoped React memoization is allowed. Publication, withdrawal and operational price/stock changes are visible on the next request without shared-cache invalidation machinery.
- Root owns migrations, shared data helpers/contracts, admin validator extensions, navigation integration and tests. Workers own bounded page families/CSS. No concurrent edits to migrations, lockfiles or shared components. Preserve UI-chat-owned `.superdesign/` and design-delivery files.
- Canonical catalog is `/shop` with query parameters; product detail remains `/products/[slug]`. Preserve `/help` and redirect verified old `/help-center`. Keep current `/learn/product-specs`, `/learn/embedded-systems`, `/learn/kit-guides`, `/learn/youtube`. Blog is `/blog` and `/blog/[slug]`. Company/editorial pages render only published records, with honest empty states. Unknown dynamic slugs must not become generic published pages.
- `getPublishedRecord(module,slug)` remains the detail boundary, enriched with validated IDs/publication metadata. Historical slugs permanently redirect to the same-kind canonical destination. Lists retain per-kind typed fields from the published document, omit rich blocks and paginate at the database boundary. FAQ placement and resource collection filtering/order are server-side, before pagination.
- Product documents gain optional `modelNumbers: string[]` (maximum 20 entries, 80 characters each, default empty). Learn resources gain optional `collection` (`product-specs`, `embedded-systems`, `kit-guides`; default `embedded-systems`). Existing documents remain valid. Both TypeScript and SQL validate these fields; they never alter prices or permissions.

## Catalog contract

Dedicated `published_list_products` RPC arguments: `p_query` <=120 characters, `p_category_ids` <=20 UUIDs, nullable integer `p_min_price_paise`/`p_max_price_paise` in 0..10^10, `p_availability` (`all`, `available`, `unavailable`), `p_sort` (`relevance`, `newest`, `price_asc`, `price_desc`, `title_asc`), `p_limit` 1..48, `p_offset` 0..10000. All predicates combine with AND; selected categories combine with OR. Reject unknown/duplicate HTTP parameters except repeated category facets. UI price fields are INR converted exactly to paise.

Search normalizes identifiers by lowercasing and removing punctuation, preserving letters/numbers and model suffixes. Exact normalized SKU/model matches rank ahead of indexed text relevance. No browser-wide catalog fetch or filtering; no second search service. Publish updates the search projection atomically; draft saves cannot change it. Unpublish/archive removes discoverability. Every search also joins the current live revision.

Price constraints apply to a variant's effective current price. `available` requires an in-range available variant; `unavailable` requires in-range variants and no in-range available variant. The returned card variants are the price-matching set, narrowed to available variants when requested. Cards label ranges/starting prices clearly and link to product details, which display every published variant with the same authoritative pricing function. No inventory counts or invented sale percentages. Stable ties use product UUID.

Return `{items,total}`. Items have `{id,slug,title,summary,document,revisionId,publishedAt,variants}`; document is a validated published product list projection, with `blocks` defaulting empty. Variant fields are `{id,sku,label,regularPricePaise,effectivePricePaise,isOnSale,saleEndsAt,availability}`. Media is referenced through the existing canonical `/api/media/{id}` publication checks. Never expose raw storage credentials or private data.

## Visual and content contracts

Use the current selected Superdesign page families. Home reference is v24 at [the selected draft](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba): 40/60 copy/circuit on desktop, illustration first below 1024px, quiet eyebrow, unchanged hero headline/CTA destinations and exact logo. Preserve current neutral/emerald tokens, shared account menu, theme and accessible navigation. Record the frozen draft versions used separately from the UI chat's changing delivery ledger.

Hero cutouts are AI-enhanced owner imagery and the shield is conceptual, not technical evidence. Sample readings must remain visibly identified as samples; do not assert working wiring, live telemetry or xC6/BMV080 compatibility. Use reviewed local assets/React behavior with effect cleanup, keyboard/touch and reduced motion; no raw prototype HTML/script injection or external runtime dependencies.

Home sections, product/category cards, About/team, Contact facts, FAQ, solutions, blog, learning resources and videos consume admin-published records. Do not seed fabricated products/prices/stock/teams/reviews/partners. Empty published data is an explicit useful state. About may show neutral avatars only for actual published team records missing a portrait. Office addresses appear on Contact only. Policies remain unavailable until approved copy is published. Inquiry receipt means persisted submission, not delivered email. Videos load an allowlisted, titled privacy-enhanced embed only after explicit play.

Metadata and sitemap contain only canonical published destinations; exclude aliases, private/admin/previews, drafts and future placeholders. Preserve genuine verified legacy routes with explicit redirects, not speculative mapping. Development remains noindex until separately authorized release.

## Acceptance

Verify admin create/edit/publish → catalog/card/detail/editorial rendering; draft isolation, withdrawal, canonical redirects and metadata/sitemap privacy; normalized SKU/model ranking, category+price+availability combinations, sort, stable pagination, totals and empty results; real Contact persistence/staff processing. Test query plans with a bounded development fixture, record scope/latencies honestly, and do not claim production capacity from local checks.

Run lint/typecheck/build, focused validation and real SDK/API tests. Use the built-in browser for public and signed-in flows at 320/768/1024/1440px, light/dark, keyboard/focus, zoom and reduced motion. Preserve the owner's profile and normal customer grants; use at most two disposable development users, clean their records/grants and restore the owner session. Review/fix findings and commit coherent Phase 4 work before any later phase.
