# Frontend theme checkpoint — 29 October 2026

## Background review — 30 October 2026

### Approved publication and light-theme correction

The owner approved commit/push and updating the existing hosted preview after light/mobile verification. The light theme now uses its own muted sage-gray pattern tokens rather than dark-theme opacity values: dots `rgb(57 91 73 / .2)`, traces `rgb(70 108 89 / .13)` and signals `rgb(0 99 56 / .24)`. Dark traces/signals retain the approved 7%/18% treatment. Dots have a 0.8px core at 28px spacing for clearer rendering on light surfaces. These tokens are only consumed by the public/customer shell and homepage hero; Admin has neither background layer.

The corrected light theme was visually checked in the Codex browser at desktop and an effective 426px CSS viewport. Pattern top/bottom match the main content top and hero bottom, with no horizontal overflow. Local Admin inspection confirmed zero public-shell or hero-pattern elements. No account/cart forms were submitted. ESLint and TypeScript passed; all 441 unit and 10 media tests passed. Earlier local-only notes below describe the design-review sequence; this final checkpoint is now authorized for the hosted development preview. Payments and real invoice issuance remain disabled.

The owner approved a faint PCB treatment behind the homepage hero and subtle dots throughout the public/customer shell for **local review first**. This supersedes the plain-background requirement below only for these decorative layers. A later correction extends the PCB across the full hero width and adds staggered CSS connection pulses repeating every 2.8 seconds, with static traces when reduced motion is preferred. Hero content has 8–24px additional responsive side padding (about 48px total inset at the checked desktop width). The existing hero typography, interactive circuit and Admin remain unchanged. Dots use a CSS radial gradient at 28px spacing; the hero uses original inline SVG traces with soft vertical edges, inspired by the reviewed shadcn.io Circuit and Magic UI Dot Pattern references without copying Pro source. Neither introduces a package, JavaScript animation loop or network asset. Both are hidden for print and forced-colors display.

Local verification: ESLint for the changed TSX and the route-generation/TypeScript check passed. The Codex browser showed the homepage in light/dark and narrow layouts (effective CSS widths 520px and 426px), with no horizontal overflow. Shop, About and account/Profile inherit dots with no PCB; Admin has neither layer. The owner's cart badge remained 11 and no account/cart forms were submitted. Changes remain local and uncommitted pending visual review; no deployment or payment enablement is included.

The subsequent animated/full-width revision passed ESLint and TypeScript. Browser checks showed full-viewport PCB width, changing dash offsets and a 2.8-second duration; desktop and 426px CSS viewport checks found no horizontal page overflow. Reduced-motion behavior is defined in CSS, but OS preference switching and performance tracing of the new background remain unverified. Theme-toggle clicks did not switch the active dark theme during the later check, so this revision has only been visually reviewed in dark mode; the earlier static revision was checked in both themes.

The final local contrast correction reduces trace opacity from 12% to 7% and pulse color opacity from 32% to 18%. The background now starts at the main content's top immediately below the navbar and ends at the hero's bottom, using the same responsive top-spacing variable as the page padding. Browser geometry confirmed identical main/pattern top and hero/pattern bottom positions with no horizontal overflow at the checked desktop width. The correction is CSS-only and remains pending owner review.

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
