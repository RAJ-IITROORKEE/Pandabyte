# Phase 5 — commerce implementation contract

**Latest scope correction:** the owner explicitly deferred checkout/payments. The cart checkpoint remains available. Work now covers non-commerce security and role-based admin under [the new contract](admin-roles.md); do not resume provider/order development until explicitly requested.

Started 24 October 2026 after Phase 4 commit `80c8685`, explicitly authorized by the owner with Luna xhigh workers, browser checks, fixes and a local commit before advancing. Phase 5 is in progress; Phase 6, deployment, live charges and GitHub publication are not authorized.

## Confirmed decisions and gates

- Razorpay **test mode**, using InsForge-managed payments and its single verified webhook receiver. Both provider connections are currently unconfigured; no provider calls or simulated paid orders until test credentials/webhook and trusted amount/subject authorization are verified. See [payment review](phase-5-payment-review.md).
- **Remove the ₹5,000 minimum for Razorpay**, per the owner's latest answer, superseding the earlier threshold and its calculation answer. Historical audit/design examples are historical, not runtime rules. No minimum is implemented in this slice.
- Owner requests Indian GST rules. This is not an approved uniform rate: product HSN/rates, inclusive/exclusive pricing, merchant GSTIN/dispatch state and shipping coverage/charges are still required. Do not invent an 18% rate, free shipping, tax exemption, or invoice details. Payment/order placement remains unavailable until totals can be authoritative.
- Selected screens: Cart v7, Checkout v7, Account/orders v7 and Admin operations v9; see [design handoff](phase-5-design-handoff.md). Illustrative records/payment states are not data.

## First independently verifiable slice: cart

Reuse published catalog and canonical current regular/sale prices. No stock reservations, order creation, payment SDK calls or minimum rule in this slice. A cart is not a price/stock guarantee. Public cart UI and PDP add-to-cart work for guests and signed-in customers. Checkout retains its real Clerk gate and an honest configuration-pending state.

Root owns migrations, integration checks, shared docs and commits. API worker owns `lib/cart/validation.ts`, `app/api/cart/**`, and `tests/cart-validation.test.mjs`. UI worker owns `components/cart/**`, `app/cart/**`, `components/catalog/product-variant-panel.tsx` and the checkout placeholder. No shared shell/lockfile edits by workers. No UI-chat-owned files are modified.

### Database and wire contract

- `customer_carts`: `user_id text` primary key (verified Clerk subject), `version bigint` starting at 1, timestamps. `customer_cart_items`: owner FK to cart, variant UUID FK with delete restricted, quantity 1–99, composite owner/variant primary key. At most 50 distinct lines enforced in RPC. Owner-only SELECT RLS; no direct customer DML. No staff access implied by staff grants.
- `customer_get_cart()` returns `{version,items,quote}`; absent cart is version 0, empty items, no write. Derive identity exclusively from `requesting_user_id()`.
- `customer_replace_cart(p_expected_version bigint,p_items jsonb)` accepts an absolute closed list of `{variantId,quantity}` and returns the same DTO. Serialize per owner, check expected version, atomically replace, increment version. New variant IDs must be currently published; existing unavailable lines can be retained/removed. No additive/retry writes or caller-supplied owner/price.
- `published_quote_cart(p_items jsonb)` is bounded/stateless and executable by anon/authenticated. Accept the same closed list; unknown/draft/archived variants are indistinguishable unavailable lines. Use only the current published revision for titles/labels/SKU, current canonical prices and the existing binary public availability; never raw stock counts or private draft fields. Do not vary availability with requested quantity: repeated queries would disclose private stock thresholds. Exact quantity is revalidated atomically at checkout in the later reservation slice.
- `CartQuoteLine`: `{variantId,quantity,productId,revisionId,slug,title,variant,lineTotalPaise,issue}`. Product metadata and `variant` are null for unavailable unpublished lines. `variant` otherwise is the existing `PublicVariant`. Issue is null, `not_available`, `price_unavailable`, or `quantity_unavailable` (binary unavailable, independent of requested quantity). Line total is quantity × current price, null if unknown; an unavailable variant can still have a known current line total. Ready for checkout does not guarantee quantity; UI must state exact stock is checked there.
- `CartQuote`: `{lines,subtotalPaise,readyForCheckout}`. Subtotal is sum of known line totals only when **all** are known, otherwise null; empty subtotal is 0. Ready means nonempty and no line issues; it is not payment availability/permission. Paise values are safe nonnegative integers; maximum total 49,500,000,000,000.
- `CustomerCart`: `{version,items,quote}`. Version is a safe nonnegative integer; input lines unique UUIDs, quantity integer 1–99, length ≤50. Preserve request order for quote; saved items may sort by variant ID.
- `GET /api/cart`: active Clerk session required, returns CustomerCart. `PUT /api/cart`: `{expectedVersion,items}`, active session, same-origin JSON body ≤8192 bytes. `POST /api/cart/quote`: public same-origin bounded JSON `{items}`, returns CartQuote. Every response private/no-store/nosniff; no shared caches. Failures `{error:{code}}`: unauthorized 401, invalid_cart 400, conflict 409, item_unavailable 409, backend_unavailable 503, plus existing safe body errors.

### Guest and UI behavior

Store only validated variant IDs/quantities in a versioned local guest cart. No customer identity, prices, addresses or tokens in browser persistence. Guest storage failures preserve the in-memory cart and show a warning. Requote on load/mutation; abort/ignore stale requests. Signed-in carts always use the server and optimistic version; don't clear/overwrite on a failed request or blindly retry conflicts. Clear private in-memory state on identity change and prevent late old-session requests from updating the new identity.

If a signed-in customer has a guest cart, offer an **explicit** merge keeping the higher quantity for matching variants; never silently add counts. Bound union to 50 lines; preserve guest data until successful server response and successful local removal. Conflict/unknown write outcome requires reload/review rather than retrying an additive merge. A pure merge helper is unit tested. Do not silently discard guest lines on login or logout.

Cart layout follows v7 with editable quantity/removal, live current totals and product links, honest empty/loading/error/unavailable states, keyboard focus, 320/768/1024/1440 responsive reflow and both themes. No invented photographs, shipping quotes or tax totals. Checkout link preserves intended return and requires Clerk there. The disabled order/payment action explains pending configuration.

## Remaining Phase 5 work

Once required merchant/payment configuration arrives: agree atomic repricing/address snapshot/reservation/idempotency contracts, verify the managed payment amount boundary with the Clerk token, then build immutable orders, verified-event settlement, durable reconciliation, customer order history and capability-checked operations/refunds. No fake success, trusted client amounts or timeout-only release. These gates and real provider tests remain required before Phase 5 completion.

For this cart checkpoint, run parser/merge tests, live two-user RLS/direct-write/optimistic concurrency/draft isolation/current-price/quantity tests, lint/typecheck/build and built-in-browser journeys. Clean only disposable fixtures, restore owner Google session, record evidence and commit coherent verified work. A cart checkpoint commit does not pass the full Phase 5 commerce gate.
