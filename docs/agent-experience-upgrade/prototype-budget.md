# Local Luna prototype allowance

10 November 2026. The owner explicitly approved **USD1 total for the prototype**.
This supersedes the earlier USD0.01 test limit for this local prototype only.
Strict ZDR, exact provider/model policy, identity/source guards and no deployment
remain unchanged. The original specification and97-row requirement register remain
the scope authority; this document describes the bounded operating contract.

## Financial admission

One private InsForge budget row binds the owner, current OpenRouter key hash,
workspace hash, GPT-6 Luna and `azure/us`. Its limit is1,000,000,000nanoUSD. The
entire earlier10,000,000nanoUSD test allowance is carried forward conservatively,
including the retained failed-attempt reservation. Old test files/markers are not
deleted, refunded, reused as fresh authority or reset.

`20261109210000_rag-prototype-budget.sql` adds private RLS tables and two signed
RPCs. The server uses the existing private signer under a separate HMAC domain.
Payloads have exact fields, short expiry and a verified Clerk text subject. No
browser-supplied amount is accepted, and the application has no create, increase,
reset, refund or delete operation.

All chat, Playground and diagnostic requests share this allowance. Reserve locks
the budget row, checks identity/key/workspace and the fixed allowance, and commits
one request reservation and counter increment atomically. Each call reserves
1,597,640nanoUSD. Identical replay never authorizes another POST; changed context
conflicts. A lost reply remains spent. Reservations survive chat deletion and
application restarts. Exhaustion and disabling prevent new reservations.

This is conservative reserved allowance, not an invoice or a provider-enforced
absolute billing limit. The transport pins unit prices, bounds serialized text to
10,000UTF-8 bytes plus1,024 framing tokens, caps output at700tokens, and validates
actual numeric token/cost receipts. Unknown results are never automatically retried.
No other application using the same provider key is configured or budgeted here.

## Activation and privacy

`PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE` explicitly selects an owner-private
local profile at `private/basic-rag-activation/luna-prototype-profile.json`.
An invalid prototype profile fails closed; it does not fall back to paid test,
free, legacy worker or native inference. The existing free and historical test
profiles are separate and preserved.

The profile binds the ledger identifier, owner/key/workspace hashes, a verified
diagnostic receipt, and a fresh privacy attestation. The previous successful
synthetic receipt remains immutable connection evidence; it is not authority to
spend from the old test budget. A new paid diagnostic is unnecessary while the
same bound model/key/provider proof and fresh endpoint checks remain valid.

**Privacy freshness remains30minutes.** Logging, traces, public prompts and data
discount must be verified off in the existing signed-in account. Each actual
dispatch freshly checks key/workspace/model eligibility, exact Azure US endpoint,
ZDR classification with safety retention false, prices and supported controls.
No tools, plugins, fallback, reasoning or caching are enabled. Final synchronous
checks retain profile/receipt identity, contents, configuration and expiry.

Expiry disables new model requests while preserving retrieval and saved history.
The dollar allowance does not expire or reset with the privacy lease. A later
Codex refresh can recheck privacy and renew the same owner's profile without a
new spending approval if allowance remains. The browser's Refresh connection
button reads current admission status; it does not manufacture privacy evidence.

Only the protected owner's current development session is activated by this
checkpoint. Other users and hosted deployments are not granted inference access.
Clerk remains the sole identity provider and InsForge owns private persistence.

## Performance and evidence

Factory-prepared contexts identify their exact authorization callback. Consumers
reuse only the factory's existing authorization around fresh catalog/scope reads;
unknown or different callbacks keep the original checks. No authorization or
source result is cached across requests.

The Playground reports admission, model round trip and context revalidation.
Model round trip includes HTTP/network/response-body work rather than pure model
inference. Source checks can overlap admission, so these figures must not be
summed as independent stages. Request-local metrics contain no prompt, subject,
session or raw provider data and do not introduce a tracing service.

Schema changes passed three intentional rollback compile units before the exact
development migration was applied. Grants were independently checked. Twelve real
Clerk/InsForge checks verified concurrent one-use reservation, replay, foreign
identity rejection, key/workspace binding, signature/field validation, anonymous
and raw-table denial, shared-surface limits, exhaustion and disabling. They used
only a disposable fixture budget and two disposable identities, all cleaned and
404/deletion verified. No provider POST occurred in those checks.

Current runtime/browser results and remaining gates are in `handoff.md` and
`p1-implementation-verification.json`. Full Phase1 is not automatically completed
by this prototype; Phase2 remains gated. No push, merge, hosting, commerce,
provider-account setting change or recovery operation is included.

## Stop or resume

To stop admission, disable the existing ledger row or unmount the prototype
profile. Retain the ledger, reservations, original test markers and diagnostic
receipt. Do not bootstrap a replacement budget when one is missing or disabled.
Resuming must preserve the same cumulative cap and requires current privacy proof.
Power-loss/disaster-recovery certification and atomic Windows ACL revocation are
not established by these application tests.
