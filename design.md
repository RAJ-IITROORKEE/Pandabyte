> Current Admin design: Supabase preset from the selected Kiranism dashboard, Outfit typography, neutral light/dark surfaces and green accents. See [theme checkpoint](docs/frontend-theme.md). Public/customer styling is unchanged.

29 October frontend override: use the Supabase homepage color reference for public/customer screens only; simplify the hero to static text without CanvasText, entry animation or pointer-follow glow. Preserve Admin's existing theme and the circuit/logo. The owner requests shared button polish, tests, commit and push. See [current theme contract](docs/frontend-theme.md). This supersedes earlier hero/color restrictions only within this presentation scope.

27 October source-cart override: the owner enabled imported-product cart actions with captured prices. Show unverified availability, preserve source provenance and provide a cart/checkout review with payment disabled. See [source-cart contract](docs/source-cart-review.md).

# PandaByte.in — editable website and design contract

27 October public storefront override: the owner selected **Products · Solutions · Shop · Company** as the four primary labels, compact catalog search/cart/account/theme utilities, Tailark company composition and Motion Primitives product Quick View. Historical navigation/component preferences below remain historical where they conflict. The existing interactive hero, global tokens and Admin interface are protected. See the [implemented public-only refactor](docs/storefront-refactor.md).

Updated 24 October 2026. This defines behavior, editable content and structural blocks for the upgraded company/storefront. The separate UI chat owns Superdesign generation and delivery records. Phase 3 and the account extension are committed; dependency remediation passed as `be2fb66`. Phase 4 is implemented and verified in development with Luna xhigh workers using the selected screens; [verification](docs/verification/phase-4.json) records browser flows and limits. Read [README.md](README.md), [plan.md](plan.md) and [Phase 4 contracts](docs/phase-4-contract.md). Localhost remains a development preview; checkout and deployment are later phases.

## Scope and content rules

The 26 October catalog integration retains the selected screen families and adds CSS-only Aceternity-inspired card actions, full-photo contain framing, responsive galleries and reduced-motion fallbacks. Development source-price observations are dated and explicitly non-purchasable, with no sale/availability claims or cart controls. Conflicting source clauses remain staff-only; see [the integration contract](docs/catalog-source-integration.md).

The current site is a migration starting point, not a feature or catalog limit. Staff must be able to add new products, categories, prices, discounts, FAQs, blog posts, team members and company content through the admin without a developer changing ordinary content. Publishing updates public pages automatically through the application’s data and cache workflow. This does not mean autonomous AI publication.

Use the exact existing logo. Existing facts/images remain traceable to the [audit](current_pandabyte_findings.in) and [content inventory](docs/content-inventory.md); new owner-authored/admin-approved material is allowed. Missing factual data stays unknown. Never fabricate people, affiliations, stock, reviews, certifications or launch dates. Neutral temporary team avatars are explicitly allowed in design previews and unpublished drafts; replace or omit them before public launch unless the owner approves their public use.

Clerk is the sole identity provider; login is required before checkout. InsForge remains database/storage. The Supabase-inspired neutral/emerald visual direction is an appearance reference, not a database change. The owner removed the ₹5,000 minimum for Razorpay and selected test mode. Historical screen notices are superseded; omit them. GST/product tax classification, inclusive/exclusive prices, merchant details and shipping settings must be approved before checkout payment is enabled. See [Phase 5 contract](docs/phase-5-contract.md).

## Coordination and current design direction

**Latest homepage selection, 24 October 2026:** the owner now selects **v26** at the same Superdesign URL. The [landing contract](docs/landing-v26.md) supersedes only the frozen homepage version, with the interactive circuit, removed visible inspector and spaced board label. Other page-family references remain unchanged. Preserve published-data truth, current Clerk account controls, keyboard access and reduced-motion fallbacks.

**Historical Phase 4 implementation reference, 24 October 2026:** the selected [Superdesign homepage](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) is frozen at **v24**, with each page family's actual version and draft ID in [Phase 4 references](docs/verification/phase-4-reference.json). The earlier v17/39-draft inventory was a historical retrieval checkpoint. Preserve the exact logo, shared tokens, responsive navigation and reusable page families. The UI chat's [screen inventory](docs/design-delivery.md) can evolve independently; do not silently replace the frozen implementation references. Prototype controls, prices and local data require real application validation. Future Agent behavior remains separate scope.

No connected Superdesign MCP capability was found in this session. The Superdesign skill's authenticated official CLI is the supported retrieval path; no new draft generation or design credits were needed for this selection.

The planning chat read the latest user brief in UI chat `01a16889-15db-7302-91f6-a44e92551fa3` and sent a coordination message on 23 October. Planning owns root README/design/plan/AGENTS and the tooling ledger; the design chat owns `.superdesign/` and [design-delivery.md](docs/design-delivery.md). Do not overwrite each other's files. Exact previews, versions and verification remain in the design delivery record; a request or working draft is not proof of completion or approval.

The user’s UI brief specifies **Solutions → Learn → About → Contact**, no navbar search, visible Login, cart/theme controls and the separately reviewed Agent prototype entry. The latest UI instruction keeps future Agent Desktop out of homepage highlights; only a Coming soon overview belongs under Solutions/About. Solutions also includes owner-approved public “Skills and CLI tools for IoT & Embedded” content; never publish local developer skill/config files. Search remains prominent within the catalog. The homepage hero and Supabase-inspired direction are retained for later visual refinement. The Agent workspace is a design prototype; production AI features, uploads to models and autonomous tools remain later scope.

## Aceternity component direction

The user selected **Aceternity UI as the preferred visual component source**, extending the earlier shadcn-only direction for text treatments, animation, buttons, cards and reusable presentation blocks. Use it within the current PandaByte tokens, exact logo and approved visual direction. The latest UI brief requests a minimal Solutions dropdown and Lucide icons (ISC); use one consistent icon family rather than mixing it with older Heroicons choices. Aceternity uses the shadcn CLI/registry workflow; retain accessible structural primitives where useful rather than duplicating their behavior. [Official CLI](https://ui.aceternity.com/docs/cli), [installation](https://ui.aceternity.com/installation).

The following are candidates for the UI chat to select and review, not a claim they are already rendered or approved individually:

| Use | Aceternity candidate | PandaByte requirement |
| --- | --- | --- |
| Hero text | Typewriter Effect, Flip Words or Text Generate Effect | One restrained treatment; render meaningful static heading text immediately and preserve its accessible reading order |
| Featured solutions/categories | Bento Grid, Card Hover Effect | Shared responsive cards with approved content, real images and keyboard-visible focus |
| About/team | Focus Cards or a restrained Card Hover Effect | Neutral preview avatars or approved team images; no essential content available only on hover |
| Primary CTA | Hover Border Gradient or Moving Border | Semantic button/link, visible focus, clear disabled/pending states; share button variants across pages |
| Section accent | Hero Highlight, Grid and Dot Backgrounds or Spotlight | Decorative only, subtle contrast-safe treatment; no effect obscures text/products |
| Verified brand strip | Infinite Moving Cards pattern | Approved logos/labels only; static reduced-motion state and pause behavior where applicable |

Reuse one set of cards/buttons/text variants across templates, with content supplied by admin records. Do not make product titles, prices, purchase controls, form labels or admin tables dependent on animation. Keep catalog product cards compact; effects must not change authentic product colors or compromise comparison/readability. Avoid simultaneous typewriter/flip/reveal treatments on the same heading.

Use Motion only for selected components that need it, with small client boundaries and a static reduced-motion fallback. Keep public content server-rendered, reserve layout space to avoid shifts, stop offscreen work where practical and measure bundle/runtime cost. Pointer effects need equivalent keyboard/touch behavior. Inspect source, dependencies and applicable component terms before copying; do not assume every Aceternity/Pro asset is MIT or included. Pro templates/blocks require the relevant entitlement and are not purchased or enabled by this request. [License reference](https://ui.aceternity.com/licence).

This step updates the plan and informs the UI chat. No registry configuration, application initialization or package installation is performed here.

## Shared header, navigation and footer

| Control | Content and behavior |
| --- | --- |
| Logo | Exact unchanged mark linked home, preserved proportions and suitable light backing in dark mode |
| Solutions | Dropdown with a nested Shop group: all catalog, IoT kits, boards, components, sensors, shields, accessories. Existing categories migrate; new Components/category entries are admin-authored and need published content. Include a Products group for approved solution/product overviews and a public Skills/CLI-tools overview when owner content is ready. |
| Products within Solutions | QR Logger, Campus Tracker, Smart Park, Nexus Solution (AI), and the agentic IoT/embedded-development platform are owner-named upcoming concepts in the UI brief. Provide overview/Coming soon structures with no invented capabilities, stock or release dates. The design chat's proposed “PandaForge” and later “Pando” names are unapproved. The latest brief highlights IoT Kits, Shop IoT & embedded products and the future agent software under Solutions; preserve the approved hierarchy at handoff. Distinguish these overview pages from purchasable hardware SKUs. |
| Learn | Blog, embedded-systems resources, PandaByte kit guides, YouTube, product specs/resources and Help Center. New articles/guides/video entries can be created in admin. |
| About | Directly discoverable About dropdown: company overview/team, approved projects, careers and upcoming information. No invented openings or achievements. |
| Contact | Direct link to the editable Contact page |
| Login/account | Visible Login while signed out; account control after Clerk sign-in. Preserve cart and safe internal return path through sign-in. No arbitrary external redirect URL. |
| Cart/theme/Agent | Cart and light/dark controls; Agent is a clearly marked prototype/coming-soon entry until separately released. No active AI service implied. |

Hover may enhance menus, but click, keyboard and mobile must expose every destination. Use disclosure buttons separate from destination links where needed. Support Escape, visible focus, focus return, nested navigation and responsive drawer behavior without hover-only access. Do not put search back in the navbar.

Footer: company/unchanged logo, owner-approved tagline/brand text and no office address (office locations appear on Contact); quick links to shop, product groups, sensors, Learn, Help Center, Contact and current policy routes; verified social links; dynamic current-year copyright. Navigation labels/order/visibility and approved internal destinations are editable in admin with validation. Never expose a design-screen/preview selector as website navigation.

## Homepage and standard blocks

Current UI sequence: **Hero → brand strip → Explore Categories → Featured Hardware → Contact Support card → FAQs → footer**. The future agent software must not displace or be highlighted in the hardware homepage hero. Its Solutions/About Coming soon overview may describe the owner-requested planned desktop editor, Arduino compatibility, PCB/CAD tools, IoT dashboard and Plan/Build/Ask modes. Windows/Linux/macOS downloads remain disabled/Coming soon. These are future intentions, not implemented capabilities; its product name still needs approval.

The brand strip uses only verified source logos with an accurately approved label; a vendor logo on the old site does not prove a collaboration. Hide unavailable sections, and provide a static/reduced-motion alternative to any moving strip.

| Block | Editable data | Rendering responsibility |
| --- | --- | --- |
| Header/footer | Labels, ordering, visibility, approved destinations, contact/social details | Shared semantic shell and interaction rules |
| Hero | Approved headline/body, real image, alt text and internal CTA | Final visual component comes from design handoff |
| Category collection | Published categories, image, description, order | Automatically includes selected published categories; no hard-coded seed array |
| Featured hardware/product card | Product selection/order; product title, media, SKU, actual prices and availability | Reuse the catalog data; calculate sale badge from authoritative price data, not independently editable percentages |
| Solution/company block | Approved content, related products, images and CTA | Controlled layouts; no arbitrary executable HTML/CSS |
| Contact Support | Approved support copy, email/phone/hours and link | Same business settings as Contact/footer |
| FAQs | Question, safe rich answer, topic, placement, order, publication | Accessible accordion/list with real answers |
| Video/resource blocks | Approved YouTube video IDs, title, description, thumbnail, ordering and product/spec links | Provider-allowlisted accessible embeds loaded on demand; never arbitrary iframe scripts |
| Blog/guide blocks | Published posts, tags, author profile, image, excerpt | Reusable listing/article template; no invented article cards |
| Team block | Person name/role/bio/photo/links/order/visibility | Founder/cofounder/leadership cards; temporary neutral avatar when permitted |
| Form/status block | Labels/help text where approved | Fixed validation/security rules, clear pending/error/success feedback |

“Fully editable” means staff control supported content and business data. New component types, schema changes, security rules and payment code remain development work. Layout primitives, logo integrity and validation cannot be weakened from a text editor.

## Page families and routes

Routes are the proposed implementation contract; reconcile actual prototype paths at handoff and preserve old URLs through verified redirects. Do not initialize these routes during planning.

| Family | Routes | Required blocks/states |
| --- | --- | --- |
| Home | `/` | Shared shell and the approved homepage sequence, populated from published admin data |
| Catalog | `/shop`, `/shop/[category]` | Catalog search, categories/facets, sort, count, pagination, compact product cards; loading/error/no results/reset; URL query state |
| Hardware product | `/products/[slug]` | Gallery, title/SKU, price/sale, availability, quantity/cart, specifications, compatibility, contents, verified resources and moderated feedback |
| Solution/product overview | `/solutions`, `/solutions/[slug]` | Approved overview and contact action; upcoming concepts remain informational until real sellable products are approved |
| Learn/blog | `/learn`, `/learn/youtube`, `/learn/resources`, `/tutorials/[slug]`, `/blog`, `/blog/[slug]` | Listing/search/tags, article body, author/date, approved video embeds/spec links, related hardware/resources; no-content/unpublished/not-found states |
| About | `/about` | Company introduction, mission/goals, real hardware/context, founder/cofounder/team area, verified relationships if approved, Contact card and FAQs |
| Contact/help | `/contact`, `/help-center` | Editable contact details/form and searchable categorized FAQs; private submission handling |
| Policies | `/shipping-and-returns`, `/terms-and-conditions`, `/privacy-policy` | Versioned owner-reviewed policy content |
| Projects/upcoming/careers | `/projects`, `/upcoming`, `/careers`, approved detail paths | Owner-created records or honest empty states; no invented claims |
| Cart/checkout | `/cart`, `/checkout` | Editable cart; sign-in required before checkout; threshold only inside checkout; address, totals and payment verification/error/cancel/retry states |
| Identity/account | Clerk catch-all sign-in/sign-up routes, `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/[id]` | Session/error states and only the customer's own records |
| Staff | `/admin` and modules below | Clerk identity plus server-controlled staff permission; no invented records/metrics |
| Agent | Prototype route from design handoff | Clearly nonproduction; no customer records, model credentials or live agent tools connected |

## Admin editability and publication matrix

**Historical Admin visual selection, 26 October 2026 (superseded by the 1 November Supabase preset):** the owner selected the Kiranism dashboard's Mono theme, Geist Mono and Tabler icons for an isolated Admin interface. This supersedes the previous Admin-only visual reference and icon direction; the public storefront retains its existing tokens, logo, hero and Lucide icons. Admin has independent light/dark preferences. See [migration contract](docs/admin-mono-migration.md) for source, component mapping, licensing and verification. Existing capabilities and backend/publication rules below remain in force.

All modules need list/search/filter, create/edit, validation, explicit save state, draft/preview/publish where relevant, recoverable errors and permission-denied states. Destructive changes need dependency-aware archive behavior; referenced products/orders must not vanish from history.

| Admin area | Required editable fields/workflows | Public effect |
| --- | --- | --- |
| `/admin/products` | Create products and variants/SKUs, descriptions, specifications, compatibility, contents, ordered media/alt text, categories, resources, slug/SEO, draft/published/archived | Listing/card/PDP generated from published records; new items beyond the audited 44 work identically |
| `/admin/categories` | Name, slug, description/image, parent/order, visibility, product assignments | Catalog and selected navigation/category blocks update; prevent cycles and handle referenced category removal |
| `/admin/pricing` | Regular/sale prices per sellable SKU; optional start/end windows, audit history | Consistent card/PDP/cart display; final checkout recomputes authoritative price |
| `/admin/discounts` | Baseline sale scheduling and eligibility; coupon/stacking/usage-limit policies only if explicitly selected | Correct server-derived savings and timing; no false sale badge or client-controlled amount |
| `/admin/inventory` | Per-SKU stock adjustments with reason, reservation-aware availability | Availability updates without overwriting existing reservations |
| `/admin/media` | Preview table with type/visibility/search filters and global active-file stats; metadata/usage dialog; private drag/drop uploads; eligible public URLs; dependency-aware archive warning | Optimized images/resources; publication and model eligibility rechecked; private inquiry attachments stay separate. See [Media contract](docs/admin-media-library.md) |
| `/admin/blog` | Rich-text body, title, slug, excerpt, cover/alt, author, tags/categories, SEO; draft, preview, publish/unpublish, revision restore | Published article/listing/metadata updates without a code deployment |
| `/admin/learn` | Approved video IDs/URLs, captions/titles, ordering/publication and product specs/resource links | Learn YouTube/resource pages with controlled embeds |
| `/admin/faqs` | Questions/answers, topic, page placement/order, visibility | Homepage FAQ and Help Center share the same approved records |
| `/admin/contact` | Email/phone/address/hours/timezone, support text, validated social links | Contact page/support card and approved footer fields stay consistent; office addresses render only on Contact |
| `/admin/inquiries` | Private inquiry list/detail, status, internal notes and authorized attachment access | Submission receipt reflects persisted inquiry; customer data never public |
| `/admin/pages` | About/company/solution/policy and standard homepage block fields, ordering/visibility within approved types | Editable company site with preview/publication and targeted refresh |
| `/admin/team` | Founder/cofounder/team roles, name, bio, photo/avatar, approved links, sort order, visibility | About team grid; no fabricated identities |
| `/admin/navigation` | Approved links/groups/order/visibility | Consistent nested header/footer navigation; prevent broken/unsafe targets |
| `/admin/orders`, `/admin/reviews`, `/admin/users` | Fulfillment/refund/support workflows; moderation; business role grants where authorized | Safe audited operational changes, never unrestricted direct state editing |

## About page and temporary avatars

Use a clear company introduction followed by the owner-approved purpose/approach and a dedicated leadership/team section. Founder, cofounder and team-lead roles can have explicitly labeled placeholder cards in the design preview. Use neutral avatar silhouettes or initials only once the real name exists; do not generate photorealistic people or invented biographies. Names, role labels, bios, images, links, order and visibility are editable from `/admin/team`. The owner can replace avatars without rebuilding the site. Omit unapproved placeholder records from the production page. Include the company goals, Contact card and relevant FAQs from shared published records. Collaboration/sponsor sections require verified relationships and permission, otherwise omit. No invented timeline, client logos or statistics.

## Contact and FAQ flows

Keep office location/address details on Contact, outside the footer. Contact form: name, email, phone, subject, message and optional attachment, consistent with the UI brief. Requiredness beyond name/email/subject/message is a reviewed form choice; do not add arbitrary extra identity requirements. Persist a validated inquiry before showing a receipt, then deliver notifications through a retryable path. Notification failure must not lose the inquiry or falsely claim delivery. Protect uploads with size/type limits, private storage, authorized access and an approved retention policy. Keep input on recoverable errors, prevent duplicate submissions and rate-limit abuse server-side.

Contact details and FAQ content are editable independently from inquiry records. FAQs support plain/structured rich answers, categories, ordering and multiple placements, with draft/preview/publication. Empty FAQ results offer reset/contact guidance. Help text and accessibility must survive content edits.

## Blog authoring and safe publishing

Provide a real rich editor with headings, paragraphs, lists, links, images/alt text, code blocks and tables when needed for technical articles. Propose Tiptap's MIT core and selected open-source extensions; keep the editor loaded only in admin and render safe structured content on public pages. Commercial collaboration/AI extensions are not assumed. [Tiptap editor](https://tiptap.dev/docs/editor/getting-started/overview).

27 October product implementation: the Mono product editor uses lazy-loaded TipTap 3.32.0 and closed structured JSON with a separate original-byte DOCX layout preview. Pricing is inline after product information; no standalone Pricing navigation remains. Gallery uploads allow five images, rich descriptions manage their own bounded image references, and existing GLB/poster previews stay available. Source observations remain price-read-only and non-purchasable. Other editorial modules retain their existing block editor. See [the product contract](docs/admin-products.md).

Save drafts separately from published revisions. Authenticated staff preview is private/noindex and bypasses shared cache. Publish validates required fields, records an immutable revision, exposes only published content and refreshes affected pages/search/metadata. Prevent silent overwrites by checking revision versions; warn about unsaved edits. Restoring an old revision creates a new auditable draft/publication. Slug changes generate a reviewed redirect. Scheduled publishing is optional unless selected; if added, it needs a real durable scheduling path and retry evidence.

## Accessibility, performance and design acceptance

Use semantic landmarks/headings, labels, visible focus, keyboard access, readable errors and announced status. Nested menus, accordions, gallery controls and dialogs need keyboard/mobile behavior, Escape and focus return. Staff tables/forms must work on narrow screens, not only the storefront. Meet WCAG 2.2 AA targets; verify contrast in both themes, zoom/reflow and reduced motion at 320/768/1024/1440px.

Server-render public content; scope client code to interactions. Keep the rich editor/admin code out of storefront bundles. Images need dimensions and responsive sizes. Define cache freshness in the plan and always recalculate money/stock on the server. Loading/empty/error/unpublished/permission states are real distinct states; unavailable private records do not mean the business has no orders.

At handoff record actual chosen draft IDs/versions and rendered evidence for the shared shell, home/catalog/PDP, Contact/FAQ/About/team, blog and editor, staff modules, and authenticated checkout. Visual polish/nav/hero enhancements remain in the design chat. Business/data behavior is judged against this contract, not inferred from a screenshot.
