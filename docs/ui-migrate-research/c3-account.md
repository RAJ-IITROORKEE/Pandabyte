# C3 account and cart CSS polish

26 October 2026. Bounded stylesheet work for the account/cart family under [`ui-migrate-plan.md`](../../ui-migrate-plan.md). The current design-delivery index lists account/orders v7 and cart v7; root owns confirming the exact comparison references and browser results.

## Source review

Callers of `components/account.module.css`:

- `app/account/page.tsx` and `components/account-dashboard.tsx`
- `app/account/settings/[[...settings]]/page.tsx`
- `components/account-profile.tsx`, `components/account-addresses.tsx`, and `components/account-files.tsx`

Callers of `components/cart/cart.module.css`:

- `app/cart/page.tsx` and `components/cart/cart-screen.tsx`
- `components/cart/add-to-cart-button.tsx`

The existing layouts already use PandaByte's surface, foreground, muted, divider, accent, action-text and status-soft theme tokens. The concrete polish gaps were: action panels and confirmation controls used mixed 8/9/12px radii; account/card spacing used one-off 14/18/26/36/38px gaps; account text actions/settings back-link and cart product/return links lacked the same explicit focus ring as other controls; and cart merge/storage notices used the stronger control border plus a tighter radius than neighboring panels.

## Changes

- Aligned page gutters and key section/grid gaps to the existing 16/24/32/48/64px spacing scale while retaining current 320px single-column breakpoints and wider desktop layouts.
- Standardized action/confirmation corners at 8px and kept card surfaces at 12px; cart notices now use the divider token and 12px card treatment.
- Applied one visible accent focus treatment across account/settings and cart interactive controls. Disabled buttons no longer respond to hover; account-disabled buttons retain readable muted text and a clear cursor state.
- Added restrained 150ms color/filter transitions and disabled those transitions for `prefers-reduced-motion`.
- Added wrapping/min-width safeguards to narrow account/settings/cart containers; address action groups can wrap.

No TSX, identity/profile/address/file behavior, cart state, API, data, or backend changes were made. No account mutation, sign-out, cart mutation, order, or payment action was performed.

## Verification

- `git diff --check -- components/account.module.css components/cart/cart.module.css` passed.
- No tests, server, build, or independent browser session were run by this lane. Root owns the integrated check and account/cart browser comparisons, including both themes and 320/768/1024/1440 CSS-pixel widths.
- Actual zoom, OS reduced-motion switching, and screen-reader speech remain unverified; CSS honors the reduced-motion preference but that does not establish runtime coverage.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
