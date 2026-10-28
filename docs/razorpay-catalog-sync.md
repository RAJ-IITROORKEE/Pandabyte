# Razorpay catalog sync diagnosis — 28 October 2026

## Current result

**Blocked by provider Plans access; not fixed.** The existing seven-event InsForge webhook is enabled in the matching Razorpay **Test Mode** account and previously delivered genuine processed checkout events. No additional webhook setup is required. Catalog sync is a separate managed InsForge operation.

Two bounded, explicit `payments razorpay sync --environment test` runs reproduced `failed`, zero sync counts and `[object Object]`. No `all` or `live` sync was invoked; no key rotation/config reset was performed.

Read-only requests with the same corrected test credentials isolated the failing stage:

| API | Result |
| --- | --- |
| Orders, count 1 | HTTP 200 |
| Items, count 100 | HTTP 200, empty collection |
| Plans, count 100 and count 1 | HTTP 401, `{"error":"Unauthorized"}` |

The Test Mode Dashboard initially showed a Subscriptions introduction. Its Get Started flow reached **“Failed to load subscriptions. Please try again.”** Account settings exposed no clearly scoped Test-only Plans enable control. A subsequent test sync still failed. The exact underlying activation/eligibility reason is unconfirmed. No live activation, commercial agreement, subscription/mandate, billing setting or payment-method change was made.

## Why the error is hidden

InsForge's [provider `syncCatalog`](https://github.com/InsForge/InsForge/blob/main/backend/src/providers/payments/razorpay.provider.ts) runs account/Orders, Plans and Items together before database writes. The denied Plans read aborts that catalog fetch; the outer [sync service](https://github.com/InsForge/InsForge/blob/main/backend/src/services/payments/razorpay/sync.service.ts) converts a non-Error SDK object with `String(error)`, yielding `[object Object]`.

The existing [normalizer](https://github.com/InsForge/InsForge/blob/main/backend/src/providers/payments/razorpay-errors.ts) recognizes nested error objects but misses this observed string-error shape: `{statusCode:401,error:"Unauthorized"}`. An upstream diagnostic fix needs to handle both shapes and identify the `plans` stage and status. It must not treat denied access as an empty catalog: successful catalog synchronization prunes missing mirrored rows.

This code runs in InsForge's hosted backend, not PandaByte's Next application. Changing frontend code, RLS, database schema or the working payment key would not repair the confirmed Plans denial. A redacted issue was submitted using the [InsForge CLI skill](C:/Users/rajra/.agents/skills/insforge-cli/SKILL.md), reference `be4e20fa-2c9b-45c9-95bf-d50f50a9f1c4`. No raw credentials, account identifiers or customer data were included.

## Owner action / ready-to-send support request

Use the account's Razorpay Support channel; no message has been sent to Razorpay by this checkpoint:

> In Test Mode, our existing API key can read Orders and Items, but `GET /v1/plans?count=1&skip=0` returns HTTP 401 with `{"error":"Unauthorized"}`. The Dashboard Subscriptions Get Started page fails to load subscriptions. Please confirm and enable this merchant's **Test Mode Plans/Subscriptions API access**, or explain the missing eligibility/activation requirement. Please do not enable live payments or change live settings. We do not need new payment keys or another webhook.

Once Razorpay resolves the test access restriction, re-run the official InsForge **test-only** sync, require a genuinely succeeded result and verify all stages. If the provider requires live activation, terms or a commercial change, stop for the owner's decision. Keep the sync status failed until the real operation succeeds; never overwrite managed health metadata to appear green.

## Verification and boundaries

- Existing test data was preserved: zero items/plans, two managed test orders, three genuine managed test webhook events and three app review histories before and after the diagnostic syncs.
- The corrected test connection is unchanged; live connection remains unconfigured. Normal app test capabilities remain false and prepare remains HTTP 503.
- Subagents independently reviewed the local app/SDK boundary and official provider/error source. There is no PandaByte catalog-sync call to patch.
- No new catalog item, plan, customer, payment, order, subscription or test identity was created. No application/runtime/frontend file changed, and no deployment occurred. The earlier successful checkout evidence remains in [the key-correction checkpoint](razorpay-test-key-correction.md).
- This checkpoint establishes the provider denial and diagnostics defect, not a successful sync or a tested backend error-formatting rollout. New item/update/delete sync tests must wait for Plans access.
