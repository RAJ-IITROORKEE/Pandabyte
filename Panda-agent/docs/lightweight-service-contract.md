# Fresh lightweight service v1

Agreed Phase 2 implementation contract, 5 November 2026. Branch `codex/panda-agent-fastapi-replacement`, base/checkpoint `bfe4683435196885c954f09470f8046165999e50`. Root verified the branch and clean worktree before this contract/start record. Latest [replacement scope](lightweight-replacement-contract.md) governs: fresh orchestration, UI and approved RAG/auth/history retained, no legacy fallback. Phase 2 is BLOCKED on compatible free-provider proof and a real grounded saved-answer/reload; this document defines the contract, not a claim that all behavior passes.

## Ownership and paths

| Owner | Write scope | Initial failing acceptance case |
| --- | --- | --- |
| Terra runtime | `Panda-agent/services/lightweight/` including private FastAPI, pinned Python dependencies, Dockerfile, SQLite journal and Python tests | Signed bounded request returns literal selections and verifiable receipt; changed payload/replayed nonce/unknown dispatch never causes a second provider call |
| Terra evidence | New `Panda-agent/src/lightweight/` bridge/client/contract modules and `Panda-agent/tests/lightweight-*.test.mjs`, coordinated filenames with Root | Python/TS fixture vectors agree on raw-body HMAC and UTF-16 limits; tampered receipt or revoked scope prevents release; signed status reconciliation performs no selection |
| Terra UI | Root-assigned thin files under `Panda-agent/src/ui/`, preserving existing appearance/state owner; focused presentation/transport tests | One submit, genuine stages, source expansion, visible unavailable/retry/cancel states; no native/model claims or provisional product text |
| Root | Same-origin BFF, Clerk/InsForge auth/config boundary, durable store and atomic source-fence migrations, legacy caller deletion, shared manifests/lockfiles, integration, Git and AWS operations | Browser → authenticated BFF → fresh selector → current source validation → exactly one durable answer → authorized reload; zero native/AWS OpenCode calls |
| Sol high | This contract, handoff, independent review, integrated evidence and signoff | Reject unsupported success, source races, ownership leakage, duplicated execution or a claimed live gate backed only by mocks |

No worker edits another scope without coordination. Customer traffic never invokes development agents. Runtime fixtures use dependency injection only, never an environment-controlled fake provider in the running product.

## RAG target and client isolation

Root's Phase 2 preflight found distinct targets: current storefront public backend `feh4966v.us-east.insforge.app` with configured Clerk template `insforge-pandabyte-migration`, while both existing CLI links name project `Pandabyte` at `r2g8wzib.us-east.insforge.app`. The mismatch blocked queries; **no SQL was executed by that preflight**. A CLI name/link or existing global client is not proof of the approved RAG authority. The observed chat 503 is not diagnosed merely by this mismatch.

Before RAG/database writes or real evidence use, Root must verify the existing approved RAG target from file-backed operator/corpus provenance, selected-project identity and narrowly scoped read-only schema/RPC checks. Verify its Clerk token template/audience/text-subject bridge with a genuine active session and current source projection. Do not copy/reingest the corpus, widen grants, query a guessed project, change JWT signing or change global storefront configuration to make chat pass.

Construct a **namespaced Agent client** only after that verification, for example explicit server-only `PANDA_AGENT_INSFORGE_BASE_URL` and `PANDA_AGENT_CLERK_JWT_TEMPLATE` with the matching target's approved client-key configuration. No blind fallback to root `createInsforgeServerClient`, global `NEXT_PUBLIC_*` backend/key/template, CLI link, an operator/service key or historical template `insforge`. A historical default can be selected explicitly only after current auth/target proof. Missing/conflicting config fails closed; preserve the storefront's current backend. The evidence worker consumes Root's injected, genuinely user-scoped RAG client and must not choose a project from customer input or import the global storefront client implicitly. Add a first failing target-isolation fixture proving an app/RAG mismatch does not silently query the app backend. This data/auth boundary is retained security infrastructure, not reuse of legacy orchestration.

## Private HTTP wire

No browser CORS endpoint, model-config input, Admin tool or broad session/database credential. Deploy privately behind the reviewed host/gateway boundary; remote transport requires authenticated HTTPS. Loopback HTTP is permitted for local/host-private testing. Anonymous `GET /health` returns generic liveness only; `GET /ready` returns generic ready/not-ready with 200/503, no provider IDs, secrets, account/capacity details or configuration dump. Provider profile OFF means not ready for provider selection, not a fabricated response.

`POST /v1/evidence/select`, `Content-Type: application/json`, exact JSON keys:

```json
{"version":1,"turnId":"UUID","productSku":"SKU","question":"bounded question","fragments":[{"handle":"trusted private handle","text":"eligible canonical fragment"}]}
```

`POST /v1/evidence/status`, exact JSON keys:

```json
{"version":1,"turnId":"UUID","requestBodySha256":"64 lowercase hexadecimal characters"}
```

The status digest is the **original select request's raw body hash**. Status never retrieves a different actor's turn and never starts provider work. Root retains the original digest/SKU in its private admitted-turn metadata for reconciliation. An ambiguous select transport followed by status not-found is not automatic permission to re-execute; absent continuity/nonadmission proof, retain honest unknown state.

Reject extra keys, malformed/duplicate JSON keys, nonfinite numbers, unpaired Unicode surrogates, wrong types and oversized data. UUID fields on the private wire are canonical lowercase UUID strings. The browser generates a request UUID; the BFF validates and lowercases it, atomically admits it with the authenticated owner/thread/question in the database, verifies the returned turn identity/question, and only then adopts that admitted request ID as the logical private `turnId`. A client UUID alone grants no execution or ownership authority. The BFF generates fresh capability nonces; GET reconciliation retains the original admitted turn ID and never invents a new execution ID. SKU is nonempty, at most 128 UTF-16 code units and must match claims exactly. Question is nonempty, at most 2,000 UTF-16 units. Fragments are 1–8 exact `{handle,text}` records, distinct nonempty handles at most 300 units, nonempty text at most 12,000 units each, at most 20,000 text units total. No input normalization changes fragment bytes. Python must match JavaScript length semantics: `len(text.encode('utf-16-le')) // 2`, rejecting unpaired surrogates. Request body maximum **98,304 raw UTF-8 bytes**, measured while streaming, independent of Content-Length.

Constructed provider prompt, including instructions/question/handles/fragments, has a separate **32,768 UTF-8 byte ceiling**. Use that byte count as a deliberately conservative admission estimate with an input-token cap of 32,768; do not call it a tokenizer measurement. The chosen endpoint must have verified compatible token/context behavior and at least input cap plus 1,024 output-token allowance. If that conservatism cannot be established for a selected model, reduce the prompt budget or leave that profile disabled; do not download a tokenizer into the base runtime. Character ceilings do not guarantee every Unicode input passes the stricter prompt budget. Check actual reported input/output usage against caps after the response.

## Capability and receipt

`Authorization: Bearer <claimsSegment>.<signatureSegment>`.

- Both segments use unpadded base64url; reject invalid encodings, noncanonical representations and more than two segments. Authorization maximum 4,096 bytes.
- `claimsSegment` is the exact base64url encoding of UTF-8 claims JSON. Signature is base64url of HMAC-SHA256 over that **literal claims segment**, using the shared server-only secret. Compare signatures in constant time. Do not log token, claims/session values or shared key.
- Claims have exactly `v`, `aud`, `action`, `sub`, `sid`, `turnId`, `sku`, `nonce`, `iat`, `exp`, `bodySha256`. `v=1`; `aud="panda-lightweight-evidence-v1"`; action is `select` or `readturn`, matching the endpoint. `sub` is lowercase SHA-256 of genuine Clerk subject; `sid` is lowercase SHA-256 of current Clerk session ID. Neither is accepted from browser JSON.
- `nonce` is a fresh UUID; `iat`/`exp` are integer UTC seconds; lifetime is 1–60 seconds. Reject expired tokens and issue times more than 5 seconds ahead of the runtime clock. `bodySha256` is lowercase SHA-256 of the exact received raw UTF-8 body. Select body turn/SKU must match claims. Status must match actor/turn/stored SKU and original request digest. A fresh genuine session for the same owner can reconcile through a newly authenticated BFF capability; a session hash is not a substitute for current BFF authorization.
- Both action nonces are one-use. Replay cannot execute or widen a request. A fresh status capability may read the same authorized turn without invoking a selector. Never grant tool permissions merely because a token is syntactically valid.

Every response to a successfully authenticated capability/body carries:

```text
X-Panda-Receipt: base64url(HMAC_SHA256(secret,
  "response.v1\n" + nonce + "\n" + claims.bodySha256 + "\n" + SHA256(rawResponseBody)))
```

Use the same unpadded base64url signature encoding and literal LF separators. BFF bounds and hashes raw response bytes, validates the receipt and exact JSON union, and then performs fresh source/session checks. Receipt binds the status request's own nonce/body hash when reconciling, not the old select capability. Invalid/unverifiable responses never become citations or durable success. Generic unauthenticated/malformed-route responses need not carry a receipt. Cross-language fixed fixtures must prove these exact bytes and rejection cases.

## Responses and errors

Response bodies are bounded to 16,384 raw UTF-8 bytes. No raw model/provider response, headers, internal prompts, stack traces, broad IDs or capability payloads enter public output.

Complete, HTTP 200, exact keys:

```json
{"version":1,"state":"complete","selections":[{"handle":"exact supplied handle","quote":"exact contiguous quote"}],"usage":{"modelCalls":1,"inputTokens":123,"outputTokens":20,"costNanoUsd":0}}
```

Selections are 0–4 exact `{handle,quote}` records with distinct supplied handles and nonempty literal quotes at most 600 UTF-16 units. Empty selection is valid insufficient evidence, not model failure. Runtime and TypeScript both validate literal binding; only TypeScript constructs public citation URL/title/capture/section DTOs. Usage fields are nonnegative safe integers: original turn-level `modelCalls` 0 or 1, input tokens ≤32,768, output tokens ≤1,024, cost exactly 0. Cached replies retain the original usage rather than pretending the turn used zero calls. Zero-call completion is allowed only through a separately authorized deterministic formatter, not a keyword shortcut. Missing/invalid actual usage or nonzero cost cannot produce validated complete success; never invent usage to make a free claim.

Noncomplete responses, exact keys:

```json
{"version":1,"state":"pending","code":"pending","usage":null}
```

| HTTP | State / code | Semantics |
| --- | --- | --- |
| 202 | `pending` / `pending` | Existing accepted work; no second provider call |
| 409 | `unknown` / `outcome_unknown` | Dispatch may have occurred; reconcile without automatic execution retry |
| 409 | `rejected` / `turn_conflict` or `capability_replayed` | Same actor/turn changed input, or used capability nonce |
| 429 | `rejected` / `busy` or `quota_exhausted` | Known unavailable admission/quota; bounded Retry-After where known; no hidden retry |
| 503 | `rejected` / `disabled` or `provider_unavailable` | Profile disabled, no eligible endpoint or known unavailable provider |
| 422 | `rejected` / `invalid_selection` or `budget_exceeded` | Known terminal output/budget validation failure; no evidence released |
| 400 / 401 / 404 / 405 / 413 | `rejected` / respectively `invalid`, `unauthorized`, `not_found`, `method_not_allowed`, `too_large` | Bounded generic boundary error; no sensitive reason |

These are the only state/code values in v1. For an ambiguous provider timeout/cancellation/transport after dispatch, use unknown—not a known-safe provider-unavailable result that invites replay. A nonzero provider charge or untrusted usage is a failed policy condition: release no answer, stop further admission for that profile and retain honest diagnostics; do not claim paid fallback or report a successful zero-cost result.

## Durable execution and limits

SQLite is runtime execution admission/reconciliation only; InsForge remains customer history/data authority. Use a persistent private volume owned by the non-root runtime; never serve the journal as an asset. No raw question/passage input is stored. Persist actor/turn/SKU and input digest, nonce usage, state/dispatch marker and bounded cached selection result/usage. Cached output contains short approved-source quotes and must remain private; it grants no source rights. No automatic eviction of pending/unknown or uniqueness records that could reopen execution; bound journal growth through admission refusal rather than unsafe deletion.

Turn primary key is `(actorHash, turnId)`; nonce is globally unique. Insert/compare admission atomically before queueing. Persist dispatch intent **before** the upstream request. On restart, dispatched-but-unresolved work becomes unknown, never automatically dispatched again. Same actor/turn with a different original body digest conflicts even with a new nonce. Fresh nonce with identical completed input returns cached complete; pending returns 202; unknown returns 409. Used nonce returns 409. Fresh status nonce reads state only and cannot transition to execution. Completed response loss is reconciled without a second call. Single-process worker ownership must be enforced; do not launch multiple workers against an assumption of in-memory-only admission.

One asynchronous worker; at most **one active** selection and **four queued**, at most one admitted active/queued turn per actor. Status reads do not consume execution slots but remain bounded. Deadline **30 seconds** from admission, including queue and provider; output maximum **1,024 tokens**, maximum one provider request per turn, no transparent HTTP/SDK retry or alternate model/provider fallback. Cancel queued work before dispatch when authoritative; cancel in-flight I/O best-effort but do not infer upstream cancellation success. If a valid terminal result arrives after browser disconnect, cache it for authorized reconciliation; never spend again because the client disconnected.

No model weights, embeddings generation, vector store, browser, shell, LangGraph, OpenCode or developer skill runtime in the base container. Optional future adapters require their phase gates. Docker must be Linux/ARM64-compatible for the approved existing host; non-root process, health/readiness, graceful shutdown and private durable journal. The 1 CPU / 512 MiB envelope remains to be measured, not assumed from this contract.

## OpenRouter profile

Default OFF. A public catalog listing is not activation or live compatibility evidence. Liquid was excluded after privacy review and is not an eligible current candidate. The recorded authenticated ZDR-endpoint/catalog intersection identifies one free endpoint: Phala, `xingchen-agi/xing4.0-29b-a4b:free`. Both separate strict zero-price/ZDR/no-fallback diagnostic attempts returned 429; no valid completion, actual usage or grounded answer was obtained. Latest recorded key quota is used 0 / limit 1,000 / remaining 1,000; quota availability is not endpoint compatibility. No runtime profile is enabled. These are dated observations, not a permanent provider inventory. Reverify endpoint identity, all applicable prices, text/structured-output/context support, privacy, account quota and provider-policy eligibility before enabling.

Use a versioned explicit model/endpoint allowlist and a single selected provider endpoint; `data_collection:"deny"`, `zdr:true`, `allow_fallbacks:false`, `require_parameters:true`, and zero `max_price` for prompt/completion/request/image fields applicable to the request. No model fallback list, external tools/plugins, image/audio routing, external tracing or paid profile. Provider preferences do not replace current endpoint/usage validation. If no compatible free/private endpoint survives those filters, remain unavailable. `data_collection:deny` alone is not a claim of ZDR; verify the selected endpoint's actual policy, including safety-retention implications. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [quota/limits](https://openrouter.ai/docs/api_reference/limits).

Fixtures inject provider/clock/journal dependencies; runtime config cannot enable fake delivery. Pricing/quota metadata reads and real generations are separately recorded. No free-model inference occurs merely to test this contract; Root owns explicit reviewed live verification/admission under the user's scope. Existing AWS hosting costs are separate from the zero inference allowance.

## BFF, public events and source release

Root owns the fresh same-origin handler/store. Switch OFF returns honest disabled/unavailable; ON imports/selects only fresh modules. Remove legacy orchestration from active replacement imports without deleting original deployments/data. Preserve current input/auth/origin/cache/owner and product-routing guards; general chat cannot become an escape hatch for failed product evidence.

Use the existing public SSE envelope: allowlisted `activity`, existing bounded `context`, then `complete` carrying **saved** public `{thread,messages}`, or the existing safe `error`. Keep product text/quotes buffered until literal selection, current session/source validation and durable save succeed. No synthetic timed tokens, native/model labels, chain-of-thought, runtime receipt, capability, private handles or usage/accounting internals in customer events. Progress may report actual reading/selecting/checking/saving stages only. Keep one assistant-ui state owner/transport and restore useful focus/error states without duplicate submits. A per-user sessionStorage UUID pointer may restore an existing active chat only after it appears in the current owner-scoped list, followed by the authenticated source-fenced GET. It stores no conversation text, receipt or credential. Missing/denied storage is optional; an invalid or inaccessible pointer never authorizes a read or a new provider execution.

Before provider context, before atomic save, before final SSE/history release and on GET/replay: revalidate current Clerk/session/turn ownership and current canonical evidence rights/revision/generation/fingerprint, including withdrawal races. Root's store/migrations must establish genuine finalization authority and current-source fencing; syntactic owner-provided text or a plain stored citation shape is not evidence of validated model/source release. Render concise product text from validated citations only. Unknown provider results stay unresolved without uncontrolled retry; a durable history summary is not a source grant.

## Required first tests and Phase 2 exit

- Runtime: fixed HMAC vectors, body/claim/scope/expiry tampering, UTF-16/UTF-8 limits, literal output, signed receipt, nonce replay, same-turn changed input, completion-loss/cache/status, pending/unknown restart, one-active/four-queue/per-actor cap, cancellation/timeout, free-profile disabled/price/privacy/quota failure and zero paid fallback. Provider call spy proves at most one dispatch.
- TypeScript: same byte vectors and receipt bounds, exact error union, source revocation before context/save/replay, no raw capability/handle leakage, no automatic execute retry after unknown transport/status, zero imports/calls to old native selectors.
- UI/BFF: one submit/one saved answer; authenticated x8266 listing MCU question with exact permitted quote/URL/section; expand/open citation, reload exactly once; keyboard send/cancel/focus/status/error/retry, long thread and small viewport, no false model labels. Root pairs browser evidence with actual auth/database/provider assertions.
- Reuse the approved corpus and history, resolve missing tracked schema dependencies explicitly, test disposable identities where mutation is needed. Live provider/real authenticated persistence, Docker build/runtime and isolated existing-host service checks remain actual gates; fixtures cannot pass them. Deployment requires a reviewed isolated port/service/routing/rollback plan preserving the active gateway/data. No new host/resize or unrelated commerce action.
