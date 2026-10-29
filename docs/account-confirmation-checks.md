# Account and confirmation checks — 29 October 2026

The owner requested bounded Luna xhigh review, non-payment browser checks, fixes and commits limited to this task. Two read-only workers reviewed confirmation response/session behavior and account routes/ownership/feedback. Payments, content publication, load tests, deployment, live email/billing and recovery remain deferred.

## Commit boundaries

The confirmation implementation was untracked work from `FRONTENT -UI`. The owner first authorized coordination, then expressly approved **“Commit confirmation baseline, then fix.”** Baseline `dea58a1` tracks only the confirmation route/view/styles, animation/celebration helpers, approved local animation and licenses, focused tests and Lottie dependency. Package entries for unrelated account/Admin/invoice tasks were preserved in the working tree and excluded from the index. No asset was downloaded or payment flow exercised here.

The follow-up commit contains the nested-response validator, its new regression file/test registration and this review evidence. It does not collect the other chat's account/Admin/profile/invoice redesign. Those ongoing changes require their own final verification; this checkpoint is not a release certification for that evolving working tree.

## Fixed response validation

`validOrder` previously accepted object-valued address fields; rendering them as React children could crash confirmation. It also accepted malformed shipment/variant text and optional monetary values. The validator now checks consumed nested fields before storing a response. Invalid data follows the existing generic, retryable unavailable path without exposing response values.

Valid sparse snapshots remain supported: omitted/null optional addresses and quote, omitted/null second address line, empty shipment, null variant and optional amounts. INR display remains integer paise; no aggregate financial reconciliation, payment-state transition or backend authority changed. Safe tracking-link restrictions and paid/test-only confirmation rules remain intact.

Ten malformed-data regressions fail before the fix and pass afterward. The final focused run passes **48 tests**, including existing account identity-switch/abort/loading/error/empty, billing, order snapshot, confirmation and animation behavior. TypeScript and targeted ESLint pass. Luna review found no remaining blocker in the validator proposal; the new cases were strengthened to include arrays containing objects. Synthetic responses are in-memory tests, not backend records or browser/provider fixtures.

## Browser observations

- **80 final layout/theme cases:** ten states at actual 320/768/1024/1440 CSS pixels in light/dark: overview, loaded profile, empty addresses, unsaved address form, empty orders, existing favorites, loaded billing, fictional invoice sample, unavailable confirmation and settings. No page-level horizontal overflow in these cases. Empty addresses/order lists are actual observed empty states; the existing favorite was not edited.
- Account navigation matches the selected section. Opening Add address focuses its label; Cancel restores Add address focus without saving. Contact phone remains unverified. Billing's unchanged Save control is disabled; no profile/address/billing/favorite/cart mutation was submitted.
- Order search produces a distinct no-match state; Clear filters restores the empty history. Delivered explains that confirmed delivery is not recorded rather than treating fulfilled as delivered. These are read-only list requests.
- A synthetic, unavailable reference reaches the real owner-scoped read endpoint and displays Order unavailable/Retry. Retry remains unavailable, with no success message. The post-fix browser check repeats this without creating an order or payment.
- The invoice sample remains explicitly fictional and not a tax invoice, including its missing tax/merchant configuration. This run reviewed its screen layouts; the earlier single-page native print-preview observation remains attributed to the UI chat's account implementation record, not this run. No physical print, PDF issue/download or new print-preview/multipage test was performed.

Initial samples caught hydration/loading transitions and a changed app-window scale; they were not counted as final results. Profile/address cases measured below the intended width were rerun at exact CSS widths. A concurrent authorized server restart interrupted navigation; the read-only check resumed after the route was reachable. Original dark appearance and default viewport were restored. A later user/other-chat navigation to Home was left intact; the post-fix check used a separate temporary tab.

## Remaining checks

No actual purchase/provider handoff, paid-order success browser state, foreign-customer browser session, simulated order creation, backend outage injection, real invoice issuance, new mutation/isolation suite, full production build or broad release suite was run. Existing source/unit evidence does not replace those flows. Genuine zoom, screen-reader speech and the owner's reduced-motion test remain open. No owner logout/account switch or private configuration read occurred.

[Machine-readable evidence](verification/account-confirmation-checks.json) records these boundaries. Full Phase 6 and commerce/release gates remain open.
