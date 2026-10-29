# Frontend desktop containers

29 October 2026: the owner requested a 1440px outer container with 24px horizontal padding across the public storefront and customer pages, Brave verification and a Vercel preview update. This change follows the separately reviewed frontend theme checkpoint `bae02e5`.

Desktop screen rules apply at 1024px and above. Header, footer, homepage, shared PublicPage routes (catalog/blog/learn/solutions), product detail, About, Contact, Help, policies, cart, checkout, confirmation and account shells use the same outer measure. Nested account Settings loses its duplicate side padding. Embedded cart drawers are excluded. Foundation/auth rules are scoped to the public site frame, which Admin and staff routes do not render.

Mobile/tablet rules, hero typography/circuit/design, Admin styles, narrow prose/form/dialog and invoice print measures are preserved. Sample invoice and order-summary screen toolbars follow the wider shell while their inner documents retain a 900px maximum. Width includes both 24px gutters under the existing border-box sizing. No business APIs, content records, authentication state, order data or payment configuration were changed.

## Local verification

- Full ESLint and TypeScript checks pass; `git diff --check` passes. All five existing sample invoice/order-document checks pass. This is a CSS-only change with no new behavior requiring unit tests.
- Brave at a 1536px CSS viewport reports 1440px outer wrappers and 24px padding on Home, Shop, About, Contact, YouTube, Blog, Help, Shipping/returns, Cart, Checkout, product detail, signed-in account Overview/Profile/Billing/Settings. No document horizontal overflow was observed.
- At that viewport, Home's content starts about 64px from the left instead of about 168px. Header/footer align with it. Both light and dark homepage themes were checked; the original dark preference was restored.
- Real Brave viewport overrides verified 1024px product detail, 768px catalog and 320px Home/Shop/Contact/Profile. Existing narrow gutters remained intact and no document overflow was observed. The viewport override was reset.
- Only read-only page visits and temporary theme/viewport controls were used. No cart, profile, address, order or payment submission was performed. Screen-reader speech and browser zoom were not retested.
- A Sol 6.1 high source review checked route coverage, cascade isolation, embedded carts and print rules. Its two missed document-wrapper findings were fixed; Brave confirms the sample's 1440px/24px outer shell and preserved 900px document without overflow.

The hosted deployment result is recorded in `docs/vercel-preview-deployment.md` once verification completes.
