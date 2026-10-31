# Local storefront test checkout — 30 October 2026

## Hosted test-preview authorization — 1 November 2026

The owner authorized Razorpay TEST checkout, test billing and order handling on `https://pandabyte-iot.vercel.app`. Hosted activation requires the explicit hosted, storefront and Razorpay test flags, the server-side proof and a test key, plus the canonical HTTPS origin and Vercel production environment. The managed InsForge test provider, signed webhook and fictional inventory remain authoritative. Live payment, simulation, email and real invoice issuance remain disabled. The provisional test tax and shipping rules below apply to this preview and are not production tax or shipping policy.

## Owner-approved scope

The owner requested complete local Razorpay TEST checkout, totals, test bills, customer tracking and Admin order handling. After the official PandaByte pages did not establish a GST percentage, price inclusion or complete rate table, the owner explicitly approved these provisional TEST rules:

- Add 18% to the goods subtotal, rounding once to the nearest paise. Do not infer GST on shipping, HSN or a legal intra/inter-state split.
- Shipping is ₹100 through a ₹2,000 goods subtotal; free strictly above ₹2,000.
- India-only checkout and existing quantity limits remain; test subtotal is bounded to ₹5,00,000. There is no ₹5,000 minimum.
- Live payment, simulation, app email notifications and real tax-invoice issuance stay disabled. Merchant legal/tax details remain unconfigured.

These rules are owner-selected development examples, not a tax classification. Sources inspected: [PandaByte shipping policy](https://www.pandabyte.in/shipping-and-returns), [DHT11 price page](https://www.pandabyte.in/product-page/temperature-humidity-dht11-sensor) and [GST Portal HSN/rate lookup](https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_HSN_SAC_Tax_Rates.htm). The public shipping policy describes fulfillment and returns, but does not establish the complete numerical policy used here.

## Boundaries and implementation

Only a loopback development server with both local test flags, a test public key and a matching private DB proof/key row enables this flow. No provider secret was copied into the app, and the existing InsForge-managed Razorpay connection and sole webhook were retained. The unrelated full catalog/Plans sync error remains unchanged; one-time Orders do not require Plans access.

Migration `20261030120000` adds an empty, RLS-protected test configuration and bounded quote/prepare functions. No actor, stock or configuration is seeded by the migration. Runtime code uses the user-scoped client, never project-admin credentials. Read-only public test quotes use current published prices. Authenticated preparation enrolls only the active subject, allocates separate fictional stock without replenishing consumed units, validates the reviewed total/policy and reuses the existing key-scoped/idempotent payment lifecycle. The original preparation rechecks prices under catalog locks. Historical fixture amounts are restored in the same transaction after the purchase snapshot is saved.

Cart and checkout discard stale quotes and block preparing payment until the matching server quote is valid. A verified browser callback is not paid: the managed signed webhook remains the settlement authority. Order snapshots retain provisional shipping, tax and policy. Existing Admin fulfillment, activity and shipment controls update the same record read by customers; no automatic carrier integration or fabricated delivery confirmation was added.

Paid Razorpay test orders have on-demand PDF bills, sourced only from bounded purchase snapshots with checked integer-paise arithmetic. Every page says **TEST — NOT A TAX INVOICE**. Customer downloads require ownership; Admin downloads use the existing `staff.manage` capability and protected Admin order RPC. Responses are attachments with `private, no-store` and `nosniff`. No legal numbering, issued-invoice ledger, real GSTIN/address or automatic email was invented. These are regenerated test statements, not immutable issued tax invoices. Latin/INR and Devanagari fonts are supported; unsupported glyphs fail generically rather than corrupting a bill.

## Verification

- Local migration applied through the official InsForge CLI. Sol high source review found and resolved temporary fixture-charge leakage before application.
- Database checks passed for the exact ₹2,000 boundary, ₹2,000.01 free shipping, odd-paise rounding, proof/config privacy, concurrent same-key preparation yielding one creation claim, changed-payload conflict, stale-price rejection, exact order snapshots and preserved legacy fixture charges.
- Codex in-app browser: owner cart remains 12 units, subtotal ₹2,870; test shipping ₹0, tax ₹516.60 and total ₹3,386.60. No owner cart mutation or checkout occurred.
- Disposable customer: added one ₹100 product, reviewed ₹100 shipping/₹18 tax/₹218 total, prepared one managed order, reloaded and recovered the same order, completed Razorpay Test netbanking and reached the confirmed order page.
- Server/API readback found one settlement, fictional inventory 99→98 once and the disposable cart reconciled to empty. Unpaid document denied, anonymous document 401 and foreign-customer document 404.
- Actual browser PDF download succeeded. PDF extraction matched purchased product, ₹218 total and the TEST notice. Separate 50-line/14-page PDF layout and Hindi-font fallback checks passed, with visual review.
- Owner restored; existing Admin browser saved Fulfilled plus clearly fictional carrier/tracking. Customer Orders and its API then showed the same saved tracking, paid state and ₹218 total.
- Full ESLint, TypeScript and unit/media suite passed. After the final Admin download addition, 17 focused authorization/render/UI/boundary checks and the final optimized build passed (38 static generations); both document functions trace all three required font files. Actual customer and authorized-Admin browser downloads succeeded. The final owner cart shows the same 12 items and ₹3,386.60 provisional test total.
- The extra production-CSP suite initially rejected the development server's expected hot-reload policy. Running the built app temporarily on port 3000 passed both security checks, including fresh trusted nonces, and both production checkout capabilities remained false. The development TEST server was then restored on the same port; no other localhost ports were used.
- Two disposable identities, their carts/profiles and fictional stock were removed after verification. Test-order, settlement, audit and managed-provider histories remain for Admin review. The unused owner restoration token was revoked, and the owner cart fingerprint still matches its pre-test value. Prior review histories were preserved.

## Remaining gates

Genuine provider failure/same-order Retry coverage from the earlier checkpoint remains unverified; this success-flow verification does not complete that matrix. Fulfilled is a manual operational state, not proof of courier delivery. Production tax/HSN, merchant legal information, shipping approval, legal invoice issuance, emails, production identity/services, recovery and release gates remain separate. The hosted preview was not redeployed or payment-enabled. The local server is left in the owner-requested TEST mode; defaults in source configuration remain false.
