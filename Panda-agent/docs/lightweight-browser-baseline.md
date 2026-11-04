# Lightweight assistant browser baseline

5 November 2026, Asia/Kolkata. Base `a3a4756fa514af780ae6a1e138d7aeddd36c77bc`; application source unchanged. Feature worktree and status are in [the handoff](lightweight-harness-handoff.md). These are baseline observations, not acceptance of a new assistant.

## Browser → API baseline

Local development: `http://localhost:3011`, Node 24.18.0 / Next.js 16.4.3. Existing development Clerk/InsForge configuration was loaded from the original checkout without copying or printing credentials. Server flags `PANDA_AGENT_LOCAL_WORKFLOW_ENABLED`, `PANDA_AGENT_TAVILY_ENABLED` and `PANDA_AGENT_NATIVE_STREAMING_ENABLED` were explicitly false. The new lightweight flag is not wired. No AWS tunnel or provider runtime was started.

The Codex in-app browser already had an active development owner session. No sign-in or cookie extraction was needed. Observed steps:

1. Navigate to `/panda-agent`; authenticated workspace and active account appeared.
2. History displayed `Could not load your chats. Please try again.` The local server reported `GET /api/panda-agent/chats` → **503**.
3. Fill the single composer with `Which MCU does the x8266 listing name?` and click **Send message** once.
4. The local server reported `POST /api/panda-agent/chats` → **503**. No messages POST reached the runtime. The visible result was `Could not create a chat. Refresh the page before trying again.` The composer became disabled. The question stayed visible; this is not a successful answer, durable save, or usable draft recovery.
5. Assert the exact failure text is visible with the connected browser's `getByText(..., {exact:true}).isVisible()`; passed. Hide the account sidebar and save a screenshot without profile details.

Reproducible baseline transcript:

```text
User: Which MCU does the x8266 listing name?
UI: Could not create a chat. Refresh the page before trying again.
Server: POST /api/panda-agent/chats 503
Assistant answer: none
```

This failure does not diagnose the live database. Missing tracked RPC definitions are independently established by the offline preflight; an authenticated JWT/configuration mismatch could also explain the observed 503. No remote schema was changed to make the baseline pass. Source tracing proves the disabled local selector returns null before legacy network I/O; chat creation failed before any selection in this attempt. No claim of a measured hosted trace or provider accounting is made.

Separate Brave profile: the first navigation to the same development route visibly reached `/sign-in?redirect_url=%2Fpanda-agent`. The local server reported a **307**, followed by **200** for the sign-in page. Focused accessibility excerpt:

```text
URL: http://localhost:3011/sign-in?redirect_url=%2Fpanda-agent
heading: Welcome to PandaByte.
text: Please sign in to continue.
link: Login
```

The user had offered to complete sign-in. A later observation in that profile was authenticated, so it was not reused as a fresh anonymous context. No automated sign-out or session changes were performed. A later attempted sign-in-heading assertion was inconclusive because the page had changed; it is not recorded as a pass. An alternative numeric-loopback URL could not connect because the server's localhost binding was not listening there; no further URL variants were tried.

Ignored evidence: `Panda-agent/infra/lightweight/artifacts/baseline-chat-failure.jpg`, `baseline-agent-tests.log`. No session tokens, cookies, original uploads or network archives were saved.

## Attempt 1 production build and server payload proxy (historical)

The same unchanged application passed lint, typecheck and production build. The build used `.next-lightweight-baseline`; Next's automatic additions of that directory to `tsconfig.json` were removed after the build, restoring the original file exactly. Observed build: compilation **62 s**, TypeScript **105 s**, **41/41** static pages generated, exit **0**. These are one local build's observations, not constrained-container or statistical latency measurements.

Production server: `http://localhost:3012`, same existing development account, ordinary network and existing browser cache. First production start reported ready in **1,177 ms**; this is one unconstrained local sample, not the container startup gate. `/panda-agent` displayed the existing production read-only notice and disabled composer, preserving its original guard. `/` rendered the unchanged storefront. A separate unauthenticated server request to `/panda-agent` reached `/sign-in`.

Requested browser viewport: 390 × 844. The viewport capability returned successfully, but the comparison page's actual document width was **1,265 px** and screenshots remained desktop sized. The override was cleared. Do not claim a mobile-profile pass.

The browser's supported read-only evaluation scope exposes DOM script elements, but `performance.getEntriesByType` is unavailable. Advertised asset capabilities inventory assets without network byte/timing capture. A native DevTools fallback could not establish a controlled measurement window; it supplied no metrics. No unsupported CDP, cookie or browser-profile access was substituted.

An authorized local equivalent was completed: inventory deduplicated same-origin `/_next/static/*.js` script elements from the real rendered production pages, then GET each public script with `Accept-Encoding: gzip` from the local server. No cookies were needed. Results:

| Route | Local script elements | Raw body bytes | Server response-body bytes | Gzip responses |
| --- | ---: | ---: | ---: | ---: |
| `/panda-agent` | 20 | 1,835,227 | 567,142 | 19/20 |
| `/` | 21 | 1,197,130 | 375,324 | 20/21 |

This is a **server payload inventory proxy**, not actual cold-browser transfer, initial-only request attribution, mobile behavior, timing or a feature delta. It excludes third-party scripts and scripts absent from the observed DOM. Dynamic imports/prefetch/cache effects are not resolved. At that attempt the corresponding browser cold-JavaScript gate was recorded **BLOCKED**. The developer reviewer agreed this proxy must not silently pass that gate; the actual browser measurement below supersedes that missing measurement, not the historical result.

Ignored reproducible inventories and calculation: `assistant-script-inventory.json`, `storefront-script-inventory.json`, `measure-script-inventory.py`, `baseline-script-payloads.json`, under the same artifacts directory. They contain public static paths and aggregate sizes, not private network archives.

## Attempt 2: actual browser ResourceTiming

Interpretation correction: Phase 1 explicitly requires cold initial JavaScript on both routes; it does not specify a mobile viewport or throttling profile. Matched mobile/network comparison and mobile long-thread behavior belong to Phase 7. The earlier failed mobile override remains a failed observation, but was incorrectly promoted to a Phase 1 requirement. This correction preserves the actual cold-JavaScript gate.

Measured 5 November 2026 using ordinary CUA navigation, existing authorized development account, Chrome 156 on Windows, actual viewport **1280 × 720**, ordinary unthrottled local network. Source revision at attempt start `a038fe3cd9e5356800011f08366fc33fabe17b6b`; application runtime paths still match base `a3a4756` exactly. Production build ID `V-qR-zG6OxeRKhaaXxngB` from `.next-lightweight-baseline`.

The local diagnostic server `Panda-agent/scripts/browser-baseline-proxy.mjs` forwards port 3001 to the owned loopback production upstream on 3012 using raw HTTP. It preserves static JS body bytes/compression, removes conditional validators and applies `no-store` for disclosed cold-network testing. It injects an early inline ResourceTiming sensor into test HTML; this is test instrumentation, not an unchanged HTML claim or application-runtime modification. An initial probe lacked the application's strict Clerk nonce and did not execute; that attempt passed no capture. The final probe reuses the server-issued nonce only in memory, leaves CSP unchanged, publishes aggregate/public-resource metrics to visible DOM, and logs/persists neither nonce nor cookies. No alternate CDP/browser driver was used.

The sensor observes a buffered resource timeline, records a 3-second quiet window after load with a 15-second maximum after load, and separately reports incomplete/error/overflow evidence. Full browser resource-entry multisets were independently reconciled against proxy full-response counts and encoded body bytes for **each** route, including repeated/shared paths. All corresponding asset responses were 200/nonzero; started=completed=entry count, in-flight=failures=0, measurement/buffer/asset/counter overflows absent. Every decoded proxy hash equals its build-file hash, independently recomputed by Sol. No second-route cache assumption was used.

| Route | Browser JS entries / unique paths | Encoded body bytes | Browser-reported transferSize | Decoded body bytes | Load event end (ms) | Capture cutoff (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/panda-agent` | 19 / 19 | 527,515 | 533,215 | 1,722,633 | 3,922.2 | 7,632.2 |
| `/` | 20 / 20 | 335,697 | 341,697 | 1,084,536 | 3,629.7 | 10,434.0 |

These are **worker-mediated, fully network-fetched first-party initial-JavaScript measurements**, one navigation per route under the declared capture window. All 19/20 entries have positive `workerStart`; do not claim direct/worker-free navigation or globally empty cache. The collector's raw `positiveTransfer` / `cacheMissEvidence` flags remain **false** because their extra criterion requires `workerStart===0`. Service-worker participation alone is not cache delivery. Sol accepts the independent full-network response/byte/hash reconciliation as evidence for the Phase 1 first-party network payload despite that extra operator criterion; the raw flags are not silently changed.

Each capture added **4,115 inline HTML bytes** for the probe, excluded from external-JavaScript totals. `transferSize` is the browser API's reported metric, not an exact packet/header-wire byte count. The encoded-byte column is the compressed/body metric for later like-for-like comparison. Local proxy overhead means these timings are not hosted latency benchmarks.

Both routes separately reported nine third-party script entries: visible encoded size 240,179 bytes, visible decoded size 809,251 bytes, transferSize 0 for all; one entry had encoded size 0. Their opaque-timing versus cache status is unresolved. Do not interpret zero as no requests or no cost, or claim whole-page/third-party cold totals. No mobile, statistical latency, feature delta, provider/runtime capacity or model-result claim is made.

Ignored source reports: `cold-agent-browser.json`, `cold-agent-server.json`, `cold-home-browser.json`, `cold-home-server.json`, `phase1-browser-reconciliation.json` in `Panda-agent/infra/lightweight/artifacts/`. Durable sanitized aggregate evidence and input-file SHA-256 values: [verification summary](verification/lightweight-phase1-20261105.json). Sol's independent Python assertion checked exact `(path, encodedBodySize)` / `(path, rawBytes)` counters, counts/statuses/overflow, real build-file hashes and every aggregate against the root reconciliation; exit 0 for both routes. Final full regression passed 152/152, no failures/skips; full lint passed after a disclosed generated-artifact ignore fix, with typecheck/build already passed for unchanged application source. Sol signed off Phase 1 PASS in [the handoff](lightweight-harness-handoff.md); this accepts baseline evidence, not a working replacement assistant.

References: [MDN transferSize](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize), [MDN encodedBodySize](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/encodedBodySize), [MDN PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver), [W3C Resource Timing](https://www.w3.org/TR/resource-timing/).

## Resume and later gates

Preserve the raw reports and this control build; repeat the same instrumentation/scope when comparing the replacement. Phase 7 still needs its matched mobile/network-profile measurements. The old server-payload proxy is retained only as historical evidence. No cookies or raw authenticated HAR should be exported.

Docker is separately unavailable on this host; its build/resource gate remains pending for later phases. No image/container measurement, provider pricing/quota verification, new FastAPI runtime, guided project example or grounded saved-answer result is claimed here.
