# Phase 1 design handoff

Updated 23 October 2026. This records the user direction, current local design evidence, and the decisions still needed before implementation uses UI components. The UI design chat owns `.superdesign/` and `docs/design-delivery.md`; this file does not approve screens or change those records.

## Current implementation boundary

The local Next.js 16.4.3 app uses the root `app/` directory. Its homepage is a static foundation-status preview: it has no final shared navigation, catalog, sign-in, shopping, account, or admin behavior. Treat it as setup context, not as a visual handoff or production page.

The design-delivery record labels itself historical. Its older one-homepage inventory is superseded by the current `.superdesign/screens.json` route index and the review records described below. This document uses those local records as evidence; it does not claim that the remote Superdesign project was refreshed during this task.

## User direction to carry into the UI review

- Main navigation order: **Solutions → Learn → About → Contact**. Keep search in the catalog, not the navbar. Keep Login visible and retain cart/theme controls.
- Keep Solutions dropdown minimal, following the user’s attached references. The UI chat must confirm the final appearance. Office addresses belong on Contact, never the footer.
- Do not feature Agent Desktop on the homepage. Any future Coming soon overview belongs under Solutions/About only. Do not publish an unapproved software name, availability statement, release date, or capacity claim.
- Add **Skills and CLI tools for IoT & Embedded** under Solutions as public, owner-approved resource/overview content. This is distinct from the private local development skills used by agents; do not expose those private skill files as product content.
- Learn includes owner-approved YouTube entries, product specifications, kit guides, and embedded-systems resources. Contact, About/team, FAQs, blogs, catalog categories and pricing must be editable through the admin, with draft/preview/publication for content.
- Clerk is the sole identity provider and login is required before checkout. The ₹5,000 minimum appears only in checkout, before payment; its qualifying subtotal and boundary remain unresolved. Preview actions must not imply a real session, order, or payment.
- Use real team identities or omit team cards from public content. Neutral temporary avatars are allowed only in private previews or unpublished drafts unless the owner approves publication.
- The latest user preference is Aceternity-styled navigation, hero, cards, admin panels, and FAQ, with **Lucide** icons (ISC). This supersedes the older Heroicons-only preference and the design-system sentence that treats Aceternity as motion reference only. Keep PandaByte’s approved tokens and structure; do not import Aceternity’s default look wholesale. Lucide is not yet installed.

## Visual and interaction contract

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#FAFAFA` | `#141414` |
| Surface | `#FFFFFF` | `#1C1C1C` |
| Text | `#171717` | `#FAFAFA` |
| Muted text | `#525252` | `#B4B4B4` |
| Action/focus | `#146C43` | `#72E3AD` |
| Control border | `#737373` | `#737373` |

Use system sans fonts, the exact unchanged logo, contained product photography, meaningful alt text, and the existing spacing/radius direction. No new font service or invented brand colors. Green is for actions and focus; keep surfaces neutral and dividers distinct from accessible control borders.

Keep public content server-rendered and client code small. Preserve the full readable text when effects are unavailable. Menus, accordions, forms and admin controls need keyboard/touch behavior, visible focus and clear errors; hover cannot carry essential content. Provide static and reduced-motion behavior. Review 320, 768, 1024, and 1440 px in light and dark modes. Loading, empty, denied, error, and unpublished states must use truthful content.

## Component candidates for UI-chat review

These are proposals, not selected registry additions. Use a small shared set and inspect source, dependencies, compatibility, and terms before adoption.

| Area | Candidate direction | Required guardrail |
| --- | --- | --- |
| Navbar | Aceternity visual styling on a compact semantic header and disclosure menu | Keep Solutions dropdown minimal; no hover-only access or unrequested scroll/floating effect |
| Hero | One restrained Text Generate/reveal treatment | Full heading is present immediately; reduced motion is static and no rotating copy |
| Categories/solutions | Bento Grid for a small number of editorial blocks | Keep real hardware photography intact; cards work by keyboard and touch |
| Product/admin cards | Shared Aceternity card and button treatment | Product facts, prices, forms, tables, and disabled states stay static and readable |
| FAQs | Aceternity-style accordion treatment | Semantic disclosure, keyboard operation, and immediate reduced-motion state |
| Icons | Lucide line icons | Use labels for icon-only controls; retain ISC notice if source requires it |

Do not stack multiple animated heading effects or make essential product/admin information depend on hover. Exact variants, styling of the nav reference, motion timing, and component licensing still need UI-chat review.

## Current artifact and review evidence

`.superdesign/screens.json` currently indexes 39 route records with draft IDs, preview URLs and local versions. Each link is a representative per-family record; use the screen index for the complete route mapping. The listed version is the local index value, not an independently refreshed remote version.

| Page family | Current indexed evidence | Saved status |
| --- | --- | --- |
| Home | [v13 · `011e75c8`](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) | Resume has v10, awaiting user review; v13 approval unverified |
| Catalog and hardware PDP | [Catalog v6 · `3e6f0e8f`](https://p.superdesign.dev/draft/3e6f0e8f-4075-4527-8140-1a969c87ea67); [xC6 v5 · `fe0c53a1`](https://p.superdesign.dev/draft/fe0c53a1-1bf4-4a2e-8a72-a6dc5ca00626) | Resume tracks Catalog and both PDPs at older versions, all awaiting review; latest indexed versions unverified |
| About, Contact, Help, policies | [About v5 · `7338e138`](https://p.superdesign.dev/draft/7338e138-5c6c-442e-8c24-71f89d06c05d); [Contact v6 · `67fead89`](https://p.superdesign.dev/draft/67fead89-2de5-435a-9872-bba495f82742) | All four tracked at v2, awaiting review; latest indexed versions unverified |
| Solutions and upcoming overviews | [Solutions v5 · `f0193ec1`](https://p.superdesign.dev/draft/f0193ec1-e264-4c54-a117-c600a626f24e); [Skills and CLI v4 · `06ebdd33`](https://p.superdesign.dev/draft/06ebdd33-fd96-4adb-a99e-c04021760e8a); [owner-named overview v3 · `ed9b63c3`](https://p.superdesign.dev/draft/ed9b63c3-5043-4f80-854c-384dc79ff5c0) | Solutions/Projects/Upcoming/Careers are tracked at v2, awaiting review. Other indexed routes have no resume status |
| Learn and editorial | [Learn v5 · `bb845f58`](https://p.superdesign.dev/draft/bb845f58-6546-4c96-bd67-c54109ae4704); [YouTube v3 · `8b2f8668`](https://p.superdesign.dev/draft/8b2f8668-4f48-44de-9d16-8a584bb94d65) | Learn and Blog are tracked at v2, awaiting review; other indexed routes have no resume status |
| Cart, checkout, account, login | [Checkout v5 · `c6fa60d8`](https://p.superdesign.dev/draft/c6fa60d8-1132-4a62-ab72-d0a88cf37dda); [Account v5 · `e14fbb05`](https://p.superdesign.dev/draft/e14fbb05-b2ab-4305-803f-2c7b28768732) | Cart/Checkout/Account are tracked at v2, awaiting review; Login has no resume status |
| Admin | [Products v5 · `6e06af84`](https://p.superdesign.dev/draft/6e06af84-879f-4222-9638-838daedc2350); [FAQs v3 · `1079b038`](https://p.superdesign.dev/draft/1079b038-c4e6-4781-bef0-3aa72d784c02) | Products/Orders/Content are tracked at v2, awaiting review; other indexed routes have no resume status |
| Agent experience | [prototype v3 · `8d1abe65`](https://p.superdesign.dev/draft/8d1abe65-78e4-4939-82e3-28c24c6e7d01) | No resume approval record; local interactions are simulated |

Approval and version status: `.superdesign/resume.json` tracks 20 targets and marks each `awaiting-user-review`. Its saved versions are older than `.superdesign/screens.json` (for example, Home v10 vs indexed v13; Catalog v3 vs indexed v6). Therefore the newer indexed versions have no verified approval status. The other 19 indexed routes have no matching resume approval record. No page family is established here as approved for implementation; confirm the latest remote versions and the UI chat’s approval before selecting components. The local index and previews are navigation aids, not approval evidence. The full route-level IDs, versions and preview URLs are recorded in [screens.json](../.superdesign/screens.json), with the saved approvals in [resume.json](../.superdesign/resume.json).

The latest local render record, `.superdesign/review/refinement-final/render-checks.json`, contains 312 entries: every indexed route at 320/768/1024/1440 px in light and dark modes. It records no overflow, broken hashes, or failed image loads. `.superdesign/review/refinement-final/interaction-checks.json` contains 14 local interaction checks, including menu keyboard behavior, form validation, a simulated Agent response, and an admin denied state. These are static local design checks; no real Clerk, InsForge, or payment requests were made. They do not establish a full accessibility audit or approve the screens. The simpler `review/final/` logs cover only 20 routes and should not be read as the current route inventory.

## Decisions and evidence needed before UI implementation

1. UI chat confirms the current draft versions, selects the page-family variants, and reviews the compact Solutions dropdown against the supplied references. Reconcile `.superdesign/screens.json` with stale `.superdesign/resume.json` statuses.
2. UI chat chooses the Aceternity variants for navbar, hero, shared cards, admin panels, and FAQ; confirm Lucide dependency/source notice and any Aceternity component terms before adding code.
3. Keep the Agent experience out of homepage highlights; review whether the existing standalone prototype draft should be retired or moved into the allowed Solutions/About Coming soon context. Do not adopt its draft title as a product name.
4. Confirm real team identities and publication permission, owner-approved public Skills/CLI entries, YouTube IDs, product-spec documents, blog/FAQ/Contact content, and office details. Missing content gets honest empty states.
5. Clerk credentials and InsForge staging configuration are pending. Checkout subtotal basis and shipping/tax policy are unresolved. Design may show clearly labeled static states; implementation cannot imply verified identity, persisted orders, or payment until the appropriate phase is configured.

The handoff covers design structure and component proposals only. Production storefront, admin, authentication, data connections, and capacity claims require their separate phase gates and evidence.
