# Public storefront refactor — 27 October 2026

The owner authorized direct implementation of the attached premium storefront brief, then explicitly excluded Admin and selected Terra 6.1 implementation workers instead of Luna. Sol 6.1 high handled source research and independent review. This checkpoint is development-only. Existing commerce, publication, privacy and redistribution boundaries remain in force.

## Audit and implementation plan

The existing Next.js 16 / React 19 / Tailwind 4 application uses npm, CSS modules and semantic light/dark variables. Clerk remains the sole identity provider; InsForge and the existing published-record/catalog APIs remain authoritative. The cart already supports guest storage and versioned customer writes. Checkout has no order/payment placement implementation. The initial repository had independent Admin, design and CAD work; none belongs to this change.

Three gaps drove the work: the former navigation contradicted the new four-label brief; shared product cards lacked Quick View; the catalog and supporting pages needed clearer hierarchy and mobile controls. The sequence was audit/reference review, public navbar, shared product interaction, scoped page refinements, then source/test/browser validation.

## Direction contract

THESIS: make real hardware photography and technical information the focus, with a restrained navigation and one distinctive card-to-preview interaction.

OWN-WORLD: retain the existing neutral/graphite surfaces, emerald accent, system UI font and exact logo. Fine separators and generous section spacing replace repeated boxed sections. Existing root tokens and hero styling are untouched.

STORY: browse Products or Shop, narrow real catalog results, open a preview, then read full specifications or use the existing cart when purchasing is actually supported.

FIRST VIEWPORT: retain the 76-pixel header height and protected interactive hero. The catalog places its heading and search above the sidebar/grid; mobile filters become a modal side panel. Product photos retain contain framing.

FORM: existing application architecture and owner-pinned Tailark/ShadcnStore references, implemented directly as requested; no new Superdesign draft generation. Seed: none (owner-pinned direction).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. The existing design.md is updated with the public-only override; no new raster assets ship.

## Implemented behavior

- Header primary labels are exactly Products, Solutions, Shop and Company. Destination labels/order/visibility still use the existing published navigation resolver inside the appropriate groups. The fixed primary labels supersede historical top-level CMS label overrides. Learn/support/contact and future concepts remain reachable within menus; future concepts are marked Coming soon. Search, cart, current Clerk controls and theme remain utilities.
- `ProductCard` remains a server adapter and serializes a bounded public subset into `ProductQuickView`. The adapted official Motion Primitives API uses its shared layout IDs and the requested spring (`bounce: 0.05`, `duration: 0.25`). The whole card surface, image, title and subtitle participate. Dedicated Quick View, details and cart controls are independent.
- Radix Dialog supplies modal focus, Escape/backdrop dismissal, background isolation and scroll cleanup. IDs/headings are connected correctly. Reduced-motion preferences disable shared layout IDs and description variants. The media carousel pauses while a preview is open. Real image thumbnails and the first five published specifications appear in previews; the full page retains the existing galleries, documents and optional 3D controls.
- Source observations keep dated archive text and explicitly disabled purchasing. Their operational price/sale/availability data is masked before client serialization. No price, stock, specification or review is invented. Private vendor-derived models remain behind existing media controls.
- Operational products can choose a quantity from 1–99 in the existing variant panel. The existing cart helper adds that quantity atomically within the same 50-line/99-unit limits. Guest conflict handling, customer versions and uncertain-outcome handling remain intact.
- Catalog filtering uses the existing validated GET contract with one shared set of controls. Desktop has a sidebar; mobile has a native modal drawer. Fields explicitly associate with the GET form so product cart/dialog controls cannot create nested forms. Search, category, price, availability, sorting, reset and pagination retain their server behavior.
- The header cart drawer lazily loads the existing `CartScreen`; no second cart store or alternate API is added. On `/cart`, the icon stays a direct link to avoid concurrent copies of a customer-cart snapshot. Embedded cart instances use unique IDs.
- Homepage sections below the hero use their own CSS module. Shared public page hierarchy, catalog/PDP presentation, cart styling and the authenticated unavailable-checkout state are refined. Original content, logo, account controls and media delivery remain intact.
- The owner's follow-up simplifies the footer to Catalog, About, Contact, Help Center, Shipping & returns, Terms & conditions and Privacy policy. The two compact groups retain published label/hide overrides for those destinations. Category/coming-soon lists are omitted from the footer. The factual default description is “Development boards, sensors and IoT kits for your next build.” Custom published brand copy remains supported.

## References and licenses

The official CLI `npx --yes shadcn@latest view navigation-menu` was inspected before implementation. There was no pre-existing `components.json` or connected shadcn MCP; targeted Radix primitives avoid reinitializing global styles or adding a second UI ecosystem. Exact dependency versions are locked in npm.

- [Motion Primitives Morphing Dialog](https://motion-primitives.com/docs/morphing-dialog), [official Basic One source](https://github.com/ibelick/motion-primitives/blob/main/app/docs/morphing-dialog/morphing-dialog-basic-1.tsx), [official component](https://github.com/ibelick/motion-primitives/blob/main/components/core/morphing-dialog.tsx). MIT notice retained in `docs/licenses/motion-primitives.txt`. The local adaptation corrects upstream trigger/focus/ARIA/scroll/reduced-motion issues and avoids its nested button example.
- [shadcn Radix NavigationMenu](https://ui.shadcn.com/docs/components/radix/navigation-menu), [skills](https://ui.shadcn.com/docs/skills), [MCP documentation](https://ui.shadcn.com/docs/mcp). Component notice retained in `docs/licenses/shadcn-navigation-menu.txt`.
- [Tailark documentation](https://tailark.com/docs) and [free header source](https://github.com/tailark/blocks/blob/main/registry/bases/radix/mist/blocks/hero-section/one/header.tsx) guided navigation and marketing composition; no paid blocks were installed or copied.
- [ShadcnStore e-commerce](https://shadcnstore.com/blocks/e-commerce) guided storefront composition. Product lists, categories, overviews, filters, carts, checkout, reviews and history categories were examined. [Free Product Card 2 source](https://shadcnstore.com/r/product-card-2.json) was inspected, including its actual registry command (`npx shadcn@latest add https://shadcnstore.com/r/product-card-2.json`). Existing PandaByte components were adapted instead of installing its mock-product page. Its sample prices, ratings and claims were discarded. [Free versus paid license terms](https://shadcnstore.com/license) were checked.

## Verification and limits

See [verification evidence](verification/storefront-refactor.json). Independent Sol review found no additional must-fix issue. Rendered browser review found and fixed an unsupported thumbnail width, vertically displaced modal image and tablet Company-menu overflow. The final image layout and menu bounds were rechecked.

The protected hero subtree and component/CSS/assets are unchanged from the preceding commit. Root global CSS and theme files also remain byte-identical. Admin changes made independently in another chat were preserved and committed there; this checkpoint contains no Admin application changes.

The current 42 products are non-purchasable source observations. Real purchase mutations were not browser-tested or enabled. Existing helper tests prove quantity bounds; authenticated cart reads and empty-state/drawer flows were checked with the owner's existing session. No CMS drafts, publication, provider settings or real customer records were changed. Checkout/payment/GST/shipping/order placement, deployment, load tests, recovery, live email and billing remain deferred. Actual screen-reader speech and runtime switching of the system reduced-motion preference remain manual gates. A development-only pre-existing Script nonce hydration warning was observed; the production build passed, but no deployment is claimed.
