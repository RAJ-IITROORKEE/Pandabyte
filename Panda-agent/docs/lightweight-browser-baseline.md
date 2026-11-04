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

## Production build and payload proxy

The same unchanged application passed lint, typecheck and production build. The build used `.next-lightweight-baseline`; Next's automatic additions of that directory to `tsconfig.json` were removed after the build, restoring the original file exactly. Observed build: compilation **62 s**, TypeScript **105 s**, **41/41** static pages generated, exit **0**. These are one local build's observations, not constrained-container or statistical latency measurements.

Production server: `http://localhost:3012`, same existing development account, ordinary network and existing browser cache. First production start reported ready in **1,177 ms**; this is one unconstrained local sample, not the container startup gate. `/panda-agent` displayed the existing production read-only notice and disabled composer, preserving its original guard. `/` rendered the unchanged storefront. A separate unauthenticated server request to `/panda-agent` reached `/sign-in`.

Requested browser viewport: 390 × 844. The viewport capability returned successfully, but the comparison page's actual document width was **1,265 px** and screenshots remained desktop sized. The override was cleared. Do not claim a mobile-profile pass.

The browser's supported read-only evaluation scope exposes DOM script elements, but `performance.getEntriesByType` is unavailable. Advertised asset capabilities inventory assets without network byte/timing capture. A native DevTools fallback could not establish a controlled measurement window; it supplied no metrics. No unsupported CDP, cookie or browser-profile access was substituted.

An authorized local equivalent was completed: inventory deduplicated same-origin `/_next/static/*.js` script elements from the real rendered production pages, then GET each public script with `Accept-Encoding: gzip` from the local server. No cookies were needed. Results:

| Route | Local script elements | Raw body bytes | Server response-body bytes | Gzip responses |
| --- | ---: | ---: | ---: | ---: |
| `/panda-agent` | 20 | 1,835,227 | 567,142 | 19/20 |
| `/` | 21 | 1,197,130 | 375,324 | 20/21 |

This is a **server payload inventory proxy**, not actual cold-browser transfer, initial-only request attribution, mobile behavior, timing or a feature delta. It excludes third-party scripts and scripts absent from the observed DOM. Dynamic imports/prefetch/cache effects are not resolved. The corresponding browser cold-JavaScript gate remains **BLOCKED**. The developer reviewer independently agreed this proxy must not silently pass that gate.

Ignored reproducible inventories and calculation: `assistant-script-inventory.json`, `storefront-script-inventory.json`, `measure-script-inventory.py`, `baseline-script-payloads.json`, under the same artifacts directory. They contain public static paths and aggregate sizes, not private network archives.

## Unblock and resume

Provide a working browser network-capture surface for the branch production build (or restore native DevTools control in a task-owned window). Preserve the existing user session. Collect actual cold JavaScript requests/encoded transfer bytes for `/panda-agent` and `/` using the same account, confirmed mobile viewport, network profile and controlled cold-cache procedure. Record the profile, build SHA and sanitized aggregate report; never export cookies or a raw authenticated HAR. Rerun affected baseline checks, then close Phase 1 and start Phase 2 automatically.

Docker is separately unavailable on this host; its build/resource gate remains pending for later phases. No image/container measurement, provider pricing/quota verification, new FastAPI runtime, guided project example or grounded saved-answer result is claimed here.
