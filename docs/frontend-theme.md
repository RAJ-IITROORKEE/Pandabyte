# Frontend theme checkpoint — 29 October 2026

The owner selects [Supabase's homepage](https://supabase.com/) as the frontend color reference, superseding `#002D04`. The later instructions explicitly exclude Admin and remove the hero text animation. InsForge and Clerk remain unchanged.

## Design

The previous hero had competing text effects, tight line breaks and a pointer-follow glow. It now uses a static three-line heading with green reserved for “IoT Experiments,” a smaller eyebrow, plain background and clear actions. Mobile puts the copy before the illustration. The existing circuit, exact logo, CMS title/summary overrides and business guards remain intact.

The actual Supabase homepage computed colors were inspected on 29 October: background `oklch(.19 .0025 157.5)`, foreground `oklch(.95 .00275 157.5)`, primary solid `oklch(.43627 .11 157.5)` and accent `oklch(.76 .15 157.5)`. Their rounded sRGB equivalents drive the dark palette below; the light palette is adapted for readable white surfaces.

| Role | Light | Dark |
| --- | --- | --- |
| Page / surface | `#fafafa` / `#ffffff` | `#131413` / `#181a19` |
| Text / muted | `#171717` / `#525252` | `#edefee` / `#bcbdbc` |
| Action / hover | `#006338` / `#076e43` | `#006338` / `#076e43` |
| Action text | White | White |
| Accent text / focus | `#006338` | `#4acd8b` |

The shared native-button recipe covers contact, cart/buy/checkout review, profile, addresses, favorites, orders and sample Billing controls. Labels, handlers, disabled/busy behavior, validation and authorization remain intact. Decorative Lucide icons add no accessible-name noise. Danger and Logout stay red. Admin retains its existing styles; four scoped token aliases prevent frontend colors leaking into inherited global rules.

## Component provenance

Shop All follows the requested [Aceternity Hover Border Gradient](https://ui.aceternity.com/components/hover-border-gradient) direction as a server-rendered Next.js link with CSS-only border motion on hover/focus and a static reduced-motion fallback. The [official registry reference](https://ui.aceternity.com/registry/hover-border-gradient.json) is credited in source. No package was added. CanvasText and its animation helper were removed after the owner's correction.

The registry names Manu Arora as author but has no SPDX license field. Do not label the snippet MIT: the separate [license page](https://ui.aceternity.com/licence) addresses Pro materials. No Pro component, Supabase logo or company copy was added; existing dependency notices remain.

## Boundaries

Browser checks are read-only: no profile saves, inquiries, cart changes, order placement or payments. No real invoices, CMS publication, load/recovery operations or redeployment are included. Pushing Git does not update the manually deployed Vercel preview.

## Verification

- Full offline suite: **443 passed** (433 unit checks plus 10 media checks); no failures or skips. Three session-harness import failures were fixed by adding the shared button mock without changing assertions.
- ESLint, route type generation/TypeScript and isolated optimized Next.js build passed. Temporary build type paths were removed from tracked configuration afterward.
- Built-in browser: hero in light/dark, static heading text and word separation, keyboard focus and Shop All navigation; 320/768/1024/1440px viewport checks; tablet catalog, desktop contact, signed-in account/Profile/Billing, checkout review and Admin dark-theme isolation. No horizontal page overflow was observed in these checks. Shared actions measured at least 44px tall, and unchanged Profile/Billing saves remained disabled.
- Computed hero heading and its spans had `animation-name: none`, with no canvas. Admin retained `#0a0a0a` background / `#f5f5f5` accent and focus. Automated contrast tests cover public light/dark/system and Admin token isolation. Final Impeccable detector returned no findings for the changed hero/theme/button targets after removing the decorative background grid.
- No claim of a full WCAG audit, screen-reader speech test, OS reduced-motion switching, Lighthouse score or hosted verification of this new styling. Screenshots and raw tool logs remain ignored local working artifacts.
