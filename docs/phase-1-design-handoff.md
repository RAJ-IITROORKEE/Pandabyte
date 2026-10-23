# Phase 1 design handoff

Updated 23 October 2026. The owner selected the existing [Superdesign homepage](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) and matching screen layouts for implementation. The UI design chat retains ownership of .superdesign/ and docs/design-delivery.md. This handoff records that selection without editing its artifacts.

## Current implementation boundary

The root-app Next.js foundation has working Clerk sign-in and account identity verification. Customer profiles, staff access and private file controls passed live Phase 2 verification; the public storefront and full admin workflows are still later work. Do not mistake the development account form for the selected final account layout.

The authenticated official Superdesign CLI confirmed 39 remote drafts and retrieved homepage v17. No connected Superdesign MCP was discovered, so use the official CLI. No new generation or credits were needed.

## User direction to carry into the UI review

- Main navigation order: **Solutions → Learn → About → Contact**. Keep search in the catalog, not the navbar. Keep Login visible and retain cart/theme controls.
- Keep Solutions dropdown minimal, following the user’s attached references. The UI chat must confirm the final appearance. Office addresses belong on Contact, never the footer.
- Do not feature Agent Desktop on the homepage. Any future Coming soon overview belongs under Solutions/About only. Do not publish an unapproved software name, availability statement, release date, or capacity claim.
- Add **Skills and CLI tools for IoT & Embedded** under Solutions as public, owner-approved resource/overview content. This is distinct from the private local development skills used by agents; do not expose those private skill files as product content.
- Learn includes owner-approved YouTube entries, product specifications, kit guides, and embedded-systems resources. Contact, About/team, FAQs, blogs, catalog categories and pricing must be editable through the admin, with draft/preview/publication for content.
- Clerk is the sole identity provider and login is required before checkout. The ₹5,000 minimum appears only in checkout, before payment; its qualifying subtotal and boundary remain unresolved. Preview actions must not imply a real session, order, or payment.
- Use real team identities or omit team cards from public content. Neutral temporary avatars are allowed only in private previews or unpublished drafts unless the owner approves publication.
- The latest user preference is Aceternity-styled navigation, hero, cards, admin panels, and FAQ, with **Lucide** icons (ISC). This supersedes the older Heroicons-only preference and the design-system sentence that treats Aceternity as motion reference only. Keep PandaByte’s approved tokens and structure; do not import Aceternity’s default look wholesale. Lucide 1.61.0 is installed for the shared frontend, with original ISC/Feather MIT notices retained.

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

The official CLI confirmed the current 39-draft project inventory; homepage v17 was retrieved. The owner selected these screen layouts as design references. Exact route/title/version/preview mappings are captured in [the verified snapshot](verification/design-reference.json). The UI chat's [delivery record](design-delivery.md) and .superdesign/screens.json remain its live inventory. Saved awaiting-review labels describe that chat's earlier checkpoint; the owner's latest selection supersedes the previous unselected-reference gate here. Fetch the relevant current draft before implementing and retain the adopted version.

The design chat records 312 local layout/DOM checks across 39 screens, four widths and two themes, plus interaction checks. Those historical prototype checks are not live Clerk, InsForge, commerce or accessibility certification. This chat verified the selected homepage is visible in the built-in browser and retrieved the project inventory; it did not independently rerun every prototype check.

## Decisions and evidence needed before UI implementation

1. Use the owner-selected Superdesign layouts and the verified snapshot; inspect the current relevant remote draft before building each route. Keep the compact Solutions menu, exact logo, theme and page-family structure.
2. UI chat chooses the Aceternity variants for navbar, hero, shared cards, admin panels, and FAQ; confirm Lucide dependency/source notice and any Aceternity component terms before adding code.
3. Keep the Agent experience out of homepage highlights; review whether the existing standalone prototype draft should be retired or moved into the allowed Solutions/About Coming soon context. Do not adopt its draft title as a product name.
4. Confirm real team identities and publication permission, owner-approved public Skills/CLI entries, YouTube IDs, product-spec documents, blog/FAQ/Contact content, and office details. Missing content gets honest empty states.
5. Clerk development login and the InsForge identity bridge are verified. Phase 2 access checks passed; shared-shell results are tracked in [frontend contracts](phase-2-frontend.md). Checkout subtotal basis and shipping/tax policy remain unresolved; design selection does not resolve business policy.

The handoff covers design structure and component proposals. Development authentication, private data and the shared frontend have separate verification evidence; production storefront/admin workflows and capacity claims still require their phase gates.
