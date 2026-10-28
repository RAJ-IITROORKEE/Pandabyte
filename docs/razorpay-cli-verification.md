# Razorpay CLI verification — 28 October 2026

The owner requested Razorpay CLI/MCP testing. The official Windows CLI **1.0.9** is installed only under ignored `.bootstrap/tools/razorpay/`; no application dependency, global PATH change or MCP installation was added. Credentials were entered through a masked prompt, passed only in the child process environment, and cleared afterward. No additional credential configuration file was written.

## Actual provider observations

Read-only `orders fetch` and `orders payments` calls used the supplied test credentials and the existing journaled order. They created no new order, charge, refund or capture.

| Observation | Provider result |
| --- | --- |
| Order status | paid |
| Order base / amount paid | 101168 / 101168 paise |
| Order amount due | 0 paise |
| Order attempts | 1 |
| Associated payments | exactly 1 |
| Payment status / captured | captured / true |
| Payment amount | 103192 paise |
| Reported payment fee / tax | 2024 / 0 paise |
| Currency | INR |

This confirms provider-side test capture. It does **not** confirm application settlement or webhook delivery. The application quote remains 101168 paise; no cart, inventory or financial state was changed from these CLI observations. The difference equals the reported fee in this example; that is an observation, not a general rule for subtracting fees.

No processed Razorpay test event was present in InsForge after this check. The app remains `verified`, awaiting confirmation. Its current exact-payment-amount matcher will reject the larger gross payment. Preserve the genuine event for review when it arrives; do not accept an arbitrary overpayment, subtract `payment.fee` blindly, manufacture processed events, or rewrite the reviewed price.

## Supported tool boundary

The CLI's registered commands expose order/payment reads, but no webhook registration, replay or generic raw-API command. The inspected official MCP tool registry likewise has no webhook management/replay tool. The documented webhook-create API is scoped to partner-managed sub-merchants and separate Partner/OAuth authorization; it does not establish support for ordinary merchant-own creation using these payment keys.

The remaining supported setup is the matching merchant's **Test Mode Dashboard** webhook. The ignored private setup sheet contains the exact InsForge URL, signing secret, seven events and existing order/payment references. It was prepared without printing the secret. The original Dashboard tab was reattached after resetting the stale browser tool session, refreshed, and its dedicated API Keys page still showed the older key ending X4g. Its exact-order search did not find the journaled order and returned a redacted subgraph error. This does not invalidate the successful CLI credential check; the target Dashboard identity remains unresolved. At the owner's request to use the browser, that Razorpay session was signed out and the sign-in page left visible for the matching account. No webhook was enabled in an unverified account during this follow-up; the PandaByte Clerk session was not changed.

## Additional checks

- A deliberately invalid webhook signature was rejected with HTTP 400. It produced no managed event. This is a rejection test, not genuine provider-delivery evidence.
- Cleanup previously accepted cancelled/failed app attempts even though a provider operation could still resolve later. It now refuses nonpaid attempts. The real fixture cleanup invocation stopped before deletion, and both existing attempt states/reservations were re-read unchanged.
- Five focused contract checks and targeted ESLint passed for this cleanup change. The previous checkpoint's full unit/build evidence remains separate.
- Provider-managed payment and event history, uncertain fixture journals, existing content, frontend design and normal payment-disable gates were preserved.

## Remaining gates

Enable and verify the correct test webhook, replay genuine existing provider events through a supported Dashboard action if available, and review base/gross amount semantics. Then validate application settlement, Admin/customer synchronization, repeated/late events and reconciled fixture cleanup. A valid signature callback or a successful CLI lookup must never be reported as a complete webhook workflow.

## Primary sources

- [Official CLI installation](https://github.com/razorpay/razorpay-cli/blob/master/docs/install.md) and [v1.0.9 registered commands](https://github.com/razorpay/razorpay-cli/blob/v1.0.9/cmd/root.go).
- [Official MCP tool registry](https://github.com/razorpay/razorpay-mcp-server/blob/main/pkg/razorpay/tools.go).
- [Partner webhook API scope](https://razorpay.com/docs/api/partners/webhooks/) and [Partner authentication](https://razorpay.com/docs/partners/aggregators/onboarding-api/).
- [Supported webhook replay](https://razorpay.com/docs/webhooks/replay-events/).
