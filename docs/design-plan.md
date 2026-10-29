# Design plan — Pandabyte engineering studio

> Historical visual-design record. Current work is phase-zero documentation under [README.md](../README.md), [design.md](../design.md) and [plan.md](../plan.md). The user handles visual design separately; do not generate drafts or contact that chat now. Clerk is now the selected sole authentication provider. Earlier generation instructions, undecided-provider wording and navigation/token proposals below are not current tasks or approvals.

Historical status: design generation was authorized earlier on 23 October 2026. One Superdesign homepage draft now exists, with responsive light/dark evidence in [design-delivery.md](design-delivery.md). Superdesign is the sole active design tool; OpenDesign setup is historical and its brief confirmation is not required. The latest visual direction replaces the earlier cyan proposal with Supabase-inspired neutral charcoal/white surfaces and restrained emerald/mint accents, adapted around the unchanged monochrome panda logo. Supabase is a visual reference only; InsForge remains the backend direction. Generation of all 19 prepared sibling screens is authorized. Production application implementation still requires separate authorization; final layouts remain design candidates.

## Experience principles

Make the product and its practical use the visual focus. Use real board/kit photography, clear specifications, generous but responsive spacing, and short company copy. Each section has one primary action. Students should find a starting kit, educators should understand teaching use, and experienced buyers should reach exact specifications quickly.

Use a shared navigation: **Shop · Solutions · Learn · Company**, with product search, account, cart, and theme control. Mobile navigation needs a focused drawer with accessible close/back behavior and a persistent route to search. No minimum-order banner outside checkout.

## Proposed page families

| Page family | Proposed paths | Main job and required states |
| --- | --- | --- |
| Home | `/` | Company proposition, featured hardware/kit, category discovery, learning entry, real project/news highlights |
| Shop | `/shop`, `/shop/[category]` | Search, verified filters, sorting, pagination, stock and price; loading/error/no results/reset states |
| Product | `/products/[slug]` | Photos, title/model/SKU, summary, price/availability, quantity/cart, key specs, compatibility, contents, documents, feedback |
| Solutions | `/solutions`, `/solutions/[slug]` | Confirmed use cases and services, related hardware/tutorials, contact action |
| Learn | `/learn`, `/tutorials/[slug]` | Searchable guides, prerequisites, required hardware, steps, tested code, documentation links |
| Blog | `/blog`, `/blog/[slug]` | Editorial listing, author/date, accessible rich content, related resources |
| Projects | `/projects`, `/projects/[slug]` | Open-source/proprietary distinctions, actual status/resources, licensing only when verified |
| Upcoming | `/upcoming` | Owner-approved product/project previews with truthful status; no invented dates or preorders |
| Company | `/about`, `/contact` | Company identity/mission, verified details and inquiry form; validation and confirmation |
| Careers | `/careers`, `/careers/[slug]` | Openings and internships, requirements, dates, application route; honest no-openings state |
| Help/policies | `/help`, retained policy paths | FAQs and support; shipping/returns, terms, privacy from approved current sources |
| Shopping | `/cart`, `/checkout`, `/orders/[reference]` | Editable cart, checkout-only minimum, payment outcomes; private/secure order lookup |
| Accounts | `/account`, order/address routes | Login/recovery, own order history and profile; authentication/authorization states |
| Staff | `/admin` and scoped sections | Product/content/operations workflows, permission denied, validation, audit history |

Routes are proposed. Prefer preserving useful legacy paths or provide one-hop permanent redirects. “Projects” is an information hub; a forum or LMS is not part of this route proposal.

## Homepage composition

1. Compact brand/navigation/search shell using the real panda logo.
2. Hero: one strong hardware/kit photograph, a concise engineering proposition, primary Shop action and secondary Learn action.
3. Category navigation with recognizable board/sensor/kit imagery.
4. One featured kit/project story with linked hardware and learning material.
5. Brief company section with verified facts and an About link.
6. Latest real tutorials/blog/project announcements; omit empty promotional blocks until content exists.
7. Support and company footer, careers/policies/social destinations.

Avoid an endless equal-weight feature-card grid, decorative blobs, stock circuit imagery, and unsupported trust badges. Do not hide core product information behind hover interactions or motion.

## Catalog and product interaction

Search should prioritize SKU/model and preserve technical identifiers. Shareable filter/sort URL state, visible active-filter chips, results count, clear reset, and useful no-results guidance are proposed. Start with category, price, and stock. Technical filters appear only once source data is normalized.

Product layout: photo gallery and purchase summary first; scannable specifications, compatibility, kit contents and resources next; actual related tutorials and moderated feedback below. Make technical tables readable on narrow screens. Distinguish board supply voltage from GPIO logic levels. Show unavailable or unpublished variants honestly; never invent product compatibility.

Use image galleries with keyboard-operable controls, meaningful image alternatives and zoom that does not trap focus. Quantity errors appear beside the control. Cart feedback should confirm the action and offer the next step without blocking further browsing.

## Proposed tokens

These are **proposed interface tokens** following the latest Supabase-inspired neutral/green visual direction and designed to sit alongside the existing monochrome logo. The logo itself remains unchanged.

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#FAFAFA` | `#141414` |
| Surface | `#FFFFFF` | `#1C1C1C` |
| Main text | `#171717` | `#FAFAFA` |
| Secondary text | `#525252` | `#B4B4B4` |
| Action | `#146C43` | `#72E3AD` |
| Primary action text | `#FFFFFF` | `#0B2116` |
| Control border | `#737373` | `#737373` |

Calculated sample contrast: light action/background **6.18:1** and white/action **6.45:1**; dark action/background **11.67:1** and dark action text/action **10.70:1**; control border/background **4.54:1** in light and **3.89:1** in dark. These use WCAG relative luminance; all real components, hover/disabled/focus states, charts and photo overlays still require checks. [Contrast guidance](https://www.w3.org/TR/WCAG22/#contrast-minimum)

Use semantic tokens in `globals.css` after scaffolding. Typography proposal: a neutral system sans stack with system monospace for SKUs/code/specs; evaluate a branded font separately if requested. Inter/Geist font files have their own font licenses and must not be labeled MIT automatically.

Proposed spacing scale: 4/8/12/16/24/32/48/64/96/112 px; desktop sections 96–112 px, mobile 48–64 px as content permits. Use a responsive 12-column layout, restrained 8–16 px corner radii, clear borders and minimal shadow. Large catalog grids can be regular; editorial emphasis should remain deliberate.

Preserve logo proportions and full mark. If its current black artwork is unclear on a dark header, place the unchanged asset on a suitable light surface. Do not recolor it or generate an alternative.

## Motion and accessibility

Propose 120–180 ms hover/focus feedback and 180–260 ms drawers/accordions. Use color/opacity/short transform transitions; avoid scroll hijacking, parallax, endless animation, flashing and autoplay. With reduced motion, remove spatial movement and keep immediate understandable state changes. CSS covers simple feedback; Motion is optional for an approved coordinated interaction. [Motion accessibility](https://motion.dev/docs/react-accessibility)

Target WCAG 2.2 AA: semantic landmarks/headings, skip link, keyboard-operable menus, visible focus, labeled controls, readable errors, dialog focus return, announcements for cart/form changes, accessible tables and at least AA text/UI contrast. Aim for 44 px touch targets where practical. Test zoom and narrow reflow; 320/768/1024/1440 px are baseline review sizes.

## Checkout composition

At checkout entry, show the ₹5,000 eligibility rule and current qualifying amount before the payment step. Below the threshold, explain the amount required and offer a route to continue shopping. Do not show this notice in the shared header, product cards, or cart page. Threshold basis must be approved and mirrored by server validation.

Display order lines, shipping, taxes and final total clearly before payment. Define guest/account checkout before drawing the authentication step. Include address/payment errors, canceled payment, pending verification, success and retry states. Avoid claiming payment success while verification is pending.

## References and design review sequence

Use PandaByte for content and identity. Study [Seeed product documentation](https://www.seeedstudio.com/Seeed-XIAO-ESP32C3-p-5431.html), [Adafruit product-to-learning links](https://www.adafruit.com/product/5400), [Arduino documentation](https://docs.arduino.cc/) and [Raspberry Pi company/product structure](https://www.raspberrypi.com/) for specific navigation patterns. [Robu.in](https://robu.in/) is a potential local catalog reference; the user's spoken “Robo.in” spelling was not conclusively resolved. Do not copy competitors' branding, copy, or images.

Earlier proposed sequence: extend the existing homepage direction across the 19 prepared screens in Superdesign, then review the resulting previews for mobile/desktop, both themes, and the requested motion and navigation behavior. Do not interpret design generation approval as approval to implement or deploy the production application.
