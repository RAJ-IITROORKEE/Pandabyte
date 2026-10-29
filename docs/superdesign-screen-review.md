# Superdesign: 20-screen visual review

23 October 2026. This record covers the current design chat's completed visual artifacts. It does not authorize application initialization, production backend work, publication or deployment. Existing planning documents and their Clerk authentication decision remain separate.

The user's latest visual direction replaces the earlier cyan draft: Supabase-inspired neutral charcoal/white, restrained emerald/mint accents, exact unchanged PandaByte panda logo, original product photography and Aceternity-style hero motion. These are review candidates awaiting user selection.

[Open homepage](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) · [Open Superdesign canvas](https://superdesign.dev/teams/a9d08ed3-0230-40c2-a3a7-9630469009e3/projects/680c1b73-1ffe-4278-a414-af8c74620e28)

Each preview includes a **Design screens · 20 previews** menu above the footer. It is an artifact review control, not a proposed production navigation feature. Header, product and footer routes use actual returned sibling preview URLs.

## Actual screen inventory

| Screen | Intended route | Actual hosted artifact | Current version |
| --- | --- | --- | --- |
| Home | `/` | [Open preview](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) | v10 |
| Catalog and search | `/shop` | [Open preview](https://p.superdesign.dev/draft/3e6f0e8f-4075-4527-8140-1a969c87ea67) | v3 |
| PandaPulse kit | `/products/pandapulse` | [Open preview](https://p.superdesign.dev/draft/e5d5055d-1779-4480-bc8f-f94e5c9e5897) | v3 |
| xC6 board | `/products/xc6` | [Open preview](https://p.superdesign.dev/draft/fe0c53a1-1bf4-4a2e-8a72-a6dc5ca00626) | v2 |
| Cart | `/cart` | [Open preview](https://p.superdesign.dev/draft/7141b0f5-50eb-41df-963b-9f43c8dc6d0c) | v2 |
| Checkout | `/checkout` | [Open preview](https://p.superdesign.dev/draft/c6fa60d8-1132-4a62-ab72-d0a88cf37dda) | v2 |
| Account and orders | `/account` | [Open preview](https://p.superdesign.dev/draft/e14fbb05-b2ab-4305-803f-2c7b28768732) | v2 |
| About | `/about` | [Open preview](https://p.superdesign.dev/draft/7338e138-5c6c-442e-8c24-71f89d06c05d) | v2 |
| Contact | `/contact` | [Open preview](https://p.superdesign.dev/draft/67fead89-2de5-435a-9872-bba495f82742) | v2 |
| Help | `/help` | [Open preview](https://p.superdesign.dev/draft/57f80ca0-9641-477d-9c2b-839ad964a2ff) | v2 |
| Policies | `/policies` | [Open preview](https://p.superdesign.dev/draft/f3b1bc5b-0061-4f6f-8721-d23969189a9e) | v2 |
| Solutions | `/solutions` | [Open preview](https://p.superdesign.dev/draft/f0193ec1-e264-4c54-a117-c600a626f24e) | v2 |
| Learn | `/learn` | [Open preview](https://p.superdesign.dev/draft/bb845f58-6546-4c96-bd67-c54109ae4704) | v2 |
| Blog | `/blog` | [Open preview](https://p.superdesign.dev/draft/a1fd2040-3910-4a28-b93a-c4ae9d3d481e) | v2 |
| Projects | `/projects` | [Open preview](https://p.superdesign.dev/draft/d3bf399e-a54e-45ac-8971-06746b02dca4) | v2 |
| Upcoming | `/upcoming` | [Open preview](https://p.superdesign.dev/draft/3774b26e-74a9-4e83-91a4-195cf2713cdd) | v2 |
| Careers | `/careers` | [Open preview](https://p.superdesign.dev/draft/010606ea-b8c8-464e-88ad-cfe530f27915) | v2 |
| Admin catalog | `/admin/products` | [Open preview](https://p.superdesign.dev/draft/6e06af84-879f-4222-9638-838daedc2350) | v2 |
| Admin operations | `/admin/orders` | [Open preview](https://p.superdesign.dev/draft/e2ad89c7-03ec-404c-81b6-b0e78f676572) | v2 |
| Admin content | `/admin/content` | [Open preview](https://p.superdesign.dev/draft/5e8c9517-2973-47a1-9401-1aa082d4fc91) | v2 |

The exact draft/node/project URLs, local sources, versions and generation origins are retained in [screens.json](../.superdesign/screens.json). [resume.json](../.superdesign/resume.json) stores all 20 route targets and SHA-256 fingerprints of the three current context files. No canvas or draft IDs were invented.

## Theme and motion

Light: background #FAFAFA, surface #FFFFFF, text #171717, secondary #525252, action #146C43 with white text. Dark: background #141414, surface #1C1C1C, text #FAFAFA, secondary #B4B4B4, action #72E3AD with #0B2116 text. Form borders #737373; dividers vary by theme. System sans and monospace SKU labels avoid external font downloads.

Hero motion uses a finite staggered entrance, subtle grid/spotlight treatment and restrained pointer tilt. Reduced-motion CSS removes entrance, transforms and smooth scrolling. Theme preference persists across previews. The monochrome original logo is unchanged, with white backing where needed in dark mode. [Design tokens](../.superdesign/design-system.md) and [motion brief](../.superdesign/motion-brief.md) retain the detailed direction.

## Tool and subagent provenance

Superdesign official CLI 0.14.0, authenticated Personal account. Homepage, catalog and PandaPulse detail began as native Superdesign generations; root corrected and integrated them. Seventeen sibling screens were authored by bounded Luna subagents at extra-high reasoning and imported into the same Superdesign canvas using its supported design-with-your-model workflow. Root integrated every route and performed the final browser checks. All final imports returned without warnings. Do not describe all 20 as native model generations.

Recorded native generation responses consumed 21 credits for initial home, 37 for motion refinement, and 73 for the catalog/PandaPulse flow. Imports did not invoke further AI generation. OpenDesign was abandoned after the user's switch; no OpenDesign generation was performed.

Only the four previously audited original PandaByte assets are used. [Earlier delivery record](design-delivery.md#asset-provenance) retains original Wix URLs, upload references and file hashes. Superdesign-managed asset hosting is not a provisioned PandaByte production backend.

## Verification performed

- **160 DOM layout checks:** all 20 routes at 320/768/1024/1440 px in light and dark. No horizontal document overflow, broken same-page anchors or unloaded images found. The minimum-order text appears only at checkout. [Evidence JSON](../.superdesign/review/final/render-checks.json).
- Catalog: exact SKU, combined filters, empty results, reset, minimum price, sort, and mobile filter dialog/Escape focus checked. Category query routing initializes the corresponding filter. PandaPulse quantity validation and illustrative add action checked.
- Checkout: below/at/above example subtotals, shortfall, local required-field validation, disabled real payment action and simulated failure checked. Cart: keyboard quantity update to ₹40,900, invalid quantity feedback retaining the last valid subtotal, remove and empty state checked. Mobile homepage menu Escape closes it and restores focus. [Final interaction evidence](../.superdesign/review/final/interaction-checks.json).
- Integer-paise arithmetic, quantity bounds, subtotal examples and checkout-only minimum assertions passed with `node .superdesign/review/screens/commerce-check.cjs`. All embedded design scripts were syntax checked.
- Independent read-only subagent integration audit found no unapproved images, invented stock/shipping/copyright claims, or real form/network submissions.

Representative visual captures: [desktop dark](../.superdesign/review/final/home-1440-dark.png), [desktop light](../.superdesign/review/final/home-1440-light.png), [mobile dark](../.superdesign/review/final/home-320-dark.png), [mobile light](../.superdesign/review/final/home-320-light.png), [checkout mobile](../.superdesign/review/final/checkout-320-dark.png). These are viewport captures; the 160 checks are DOM checks, not 160 screenshot or accessibility audits.

## Limits and implementation boundary

These are connected design prototypes. Cart/account/admin/contact actions are local simulations and do not persist or submit real records. Checkout examples disclose that the qualifying subtotal basis still needs owner confirmation. Source-limited editorial, careers and project pages use honest empty states. No fabricated reviews, metrics, vacancies or private order data were inserted.

No application scaffold, Git initialization, production backend, payment integration, repository publication or deployment was performed in this design work. No application build exists to test. No full accessibility audit, assistive-technology session, automated contrast/zoom audit or OS reduced-motion emulation was performed; reduced-motion CSS was inspected. Further implementation requires the next authorized phase.
