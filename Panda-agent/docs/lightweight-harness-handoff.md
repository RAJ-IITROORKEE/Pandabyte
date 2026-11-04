# Lightweight Panda Agent handoff

- Latest authorization (5 November 2026): finish Phase 1, then build a **fresh** lightweight agent/Docker FastAPI runtime on a **separate feature branch**, preserving UI and approved RAG/auth/history protections. Remove old orchestration from the replacement caller; switch OFF is honest disabled/unavailable, never legacy fallback. Owner approved reusing the existing Panda Agent AWS host **if capacity permits**, not a new host. See [replacement scope and AWS gates](lightweight-replacement-contract.md). Earlier blanket no-deployment/default-legacy notes below are historical where superseded; no deployment has occurred.
- Branch: `codex/panda-agent-lightweight-rag`
- Base SHA: `a3a4756fa514af780ae6a1e138d7aeddd36c77bc` (fetched `origin/main`, 5 November 2026)
- Current phase: 1 — PASS (attempt 2 closed); Phase 2 PENDING checkpoint/branch preparation
- Last passing phase: 1
- Active URL: `http://localhost:3000/panda-agent` (existing development owner session; Agent tab 6 kept open).
- Process status: user-requested development server `3000` / exec `84360` remains running. Diagnostic proxy `3001` / exec `56954` and production upstream `3012` / exec `80623` were stopped after captures; IPv6-loopback checks confirmed 3000 open, 3001/3012 closed. Do not stop unrelated processes.
- Next action: Root stages/commits the seven reviewed Phase 1 files, then creates/verifies the separate fresh-replacement feature branch/worktree. Record Phase 2 IN PROGRESS and its failing contracts before runtime delegation; continue automatically under the standing phase prompt and latest replacement/AWS scope.
- Environment: Windows, Node 24.18.0, npm; baseline worktree `C:/Users/rajra/.codex/worktrees/panda-agent-lightweight-rag/Pandabyte`. Local Docker absent. Existing AWS host identity/capacity verified read-only; new-service deployment awaits reviewed build/tests, capacity and preservation checks. Separate replacement branch is not yet created in this tracker.
- Overall: Phase 1 PASS with independent browser/resource review and final checks complete. Phase 2 and all later phases remain PENDING until their recorded start; no runtime implementation, completed assistant or production-readiness claim.

## Initial ownership and authorization (historical; latest steering above governs)

The user requested implementation/testing from `C:/Users/rajra/Downloads/prompt (1).md`, with a maintained handoff. Its eight phases govern this branch. Preserve the dirty original checkout, other worktrees, source archives, histories, commerce configuration and deployed runtime. No merge, production deployment, paid benchmark or production writes. Missing live gates remain BLOCKED; fixture results do not substitute for real authenticated integration.

Configured contract/review lead and final tracker owner: `gpt-6.1-sol`, high, agent `sol_contract_review`, as recorded by the parent worker launch configuration. This is configuration evidence, not independent model introspection. Root's model remains host-selected; Root owns Git, worktree integration, local processes and hosting operations. Configured baseline-tooling implementer: `gpt-6.1-terra`, high, agent `terra_baseline_preflight`, with only the preflight script/test write scope. Further Terra implementation scopes wait for Phase 1 PASS and the agreed contracts. Development agents never run for customer questions.

## Phase tracker

| Phase | Status | Required result |
| --- | --- | --- |
| 1 | PASS | Baseline/control, source/contract review, real first-party browser/resource reconciliation and final 152-test/lint checks complete; mobile/network-profile comparison remains Phase 7 |
| 2 | PENDING | Opt-in FastAPI turn, checked evidence/citation, durable reload, zero legacy dependency |
| 3 | PENDING | Source races, isolation, cancellation and recovery |
| 4 | PENDING | Bounded student guide and reviewed Admin skill lifecycle |
| 5 | PENDING | Private screenshot flow, reviewed vendor scope, tool contracts |
| 6 | PENDING | Real restricted MCP fetch and bounded agentic retrieval |
| 7 | PENDING | Production browser delta and constrained Docker measurements |
| 8 | PENDING | Integrated final acceptance and rollback |

## Phase 1 attempt 1 — started 5 November 2026 (Asia/Kolkata)

Tested application revision: base SHA above; initial worktree clean before this handoff. At attempt start the mode was offline/source inspection and browser checks were pending. The final outcome below includes real local browser/development-service observations, offline fixtures and a local production build, distinguished explicitly. Application runtime source remains unchanged.

Commands completed from the original checkout:

```powershell
git worktree list --porcelain
git remote get-url origin
git branch -a
git fetch origin main
git rev-parse origin/main
```

All exit 0. Verified remote `RAJ-IITROORKEE/Pandabyte`; fetched SHA equals the requested base. Existing `main` is dirty with extensive untracked Agent code; nothing reset, stashed, copied or overwritten. Created managed worktree at the base, then `git switch -c codex/panda-agent-lightweight-rag` (exit 0).

Initial findings: core `Panda-agent/src/retrieval/` exists in Git, but Agent package/runtime/search/document files described in later local reports are not all tracked on main. Dependency completeness and the release branch are under read-only review. Docker unavailable; constrained-container acceptance remains open.

### Preserved initial evidence and attempts

- Full brief read (53,628 characters); SHA-256 `4a52dfa572d8538e4517d6f3fe3ad120f0ace71a34dba706e3d2c6b45e5e7e92`.
- See [file map, exact reproductions and dependency provenance](lightweight-baseline-review.md), produced by the requested `gpt-6.1-sol` / high worker. Its offline command passes **96/96** tests (exit 0). A schema-closure assertion fails as expected (exit 1, 0/9 required RPCs defined). A synthetic history-guard denial case also fails (exit 1); this is not a real source-withdrawal test.
- Correction to the initial dependency lead: main's customer TypeScript direct imports are present. The confirmed clean-clone gap is the runtime/chat SQL history; later private hosted/native source is a separate snapshot, not proof that the tracked customer TypeScript closure is missing.
- Root attempted `node --test Panda-agent/tests/*.test.mjs` before dependency installation completed: exit 1, 141 tests, 139 pass / 2 module-load failures (`guarded-dictation`, `manufacturer-source`). This is retained as a historical incomplete-install attempt; the post-install 149/149 run below supersedes it.
- PowerShell's module setup prevents `Get-Content`, and execution policy prevents `npm.ps1`; reads use Python UTF-8 and npm uses `npm.cmd`. No policy settings changed. `npm.cmd ci --ignore-scripts --no-audit --no-fund` was initially running; it subsequently completed successfully as recorded below. Root package/lockfiles remain unchanged; lock SHA-256 `fa5b5ac83ce2636b0e361ba2f162d73571ce4e82712ff85009d31767f7db21e4`.
- Skills: Ponytail, repository Find Skills/API design/Clerk/security/React performance/accessibility/web performance, reviewed release copy of LangChain RAG, and Computer Use guidance read. Existing ECC provenance remains pinned in `.agents/skills/ecc-sources.json`; no collection installed or updated.
- Registry inspection selected developer CLI `skills@1.7.6`; `npm.cmd exec --yes --package=skills@1.7.6 -- skills --version` exit 0 (`1.7.6`). Narrow owner-filtered discovery for React performance and AI SDK succeeded (exit 0); existing React guidance is reused. No new skill installation and no customer-container dependency resulted.
- Codex browser capability inventory succeeded. Opening branch port 3011 before the server was started returned connection refused; that early navigation passed no browser gate. Subsequent authenticated/anonymous observations are recorded below. No cookies/tokens extracted.
- Docker is absent from PATH and the standard Windows installation paths. FastAPI/uvicorn/httpx/pytest/LangGraph are absent from the global Python installation. Optional local Python environment installation and Docker verification have not occurred.

### Initial flag/service design (historical; replacement switch contract supersedes legacy fallback)

Use server-owned `PANDA_AGENT_LIGHTWEIGHT_ENABLED=true`, default off. False preserves the current caller; true never constructs the legacy selector and never silently falls back to it. Preserve one assistant-ui state owner and one authenticated messages transport. TypeScript retains canonical retrieval, source rights, current scope and final citation/persistence release; private FastAPI receives bounded, question/turn-bound evidence only. Current-source fencing across save and replay is required before the Phase 2 persistence gate. No broad session/database credential enters the worker; free-only model admission fails closed until the endpoint policy is verified.

### Final ownership and permitted diff

Root: managed worktree/branch, Git, baseline server/browser, shared configuration and integration. Sol high: service contracts, independent review, `lightweight-baseline-review.md`, and final ownership/update/signoff of this tracker. Root authored the browser measurement record. Terra high `terra_baseline_preflight`: only `Panda-agent/scripts/lightweight-preflight.mjs` and its focused test. Sol independently reran that focused test and the actual preflight; no actionable defect was found within the script's declared local-SQL-reference scope. This is baseline tooling, not Phase 2 runtime implementation.

The baseline checkpoint `bc23f67` contains only the preflight script, its test and these three documents: this handoff, `lightweight-baseline-review.md`, and `lightweight-browser-baseline.md`. The port-3000 follow-up changes only this handoff for a further local commit; no push or deployment. App/components/lib, root manifests/lockfiles and application runtime source remain unchanged. Next temporarily added alternate build-directory includes to `tsconfig.json`; Root restored its original bytes after the build.

Initial tested commit: `a3a4756fa514af780ae6a1e138d7aeddd36c77bc` plus the two-file baseline-tooling diff, subsequently committed in checkpoint `bc23f67`. Staged code-diff SHA-256: `62c8761c055a665bdd01e83979107adfba16ae3e94a1525df21400a944c35f8d`. Individual script/test raw SHA-256 values are respectively `c5a37bc25704cb2858eedfd3eff4b0a741346cb61ace97e2ed5bddc7d8f18777` and `dea10b8ff9a2401e85060b8ff34309bf0e42455cb320f8cfed35ececf54a7ccf`. Documentation edits are not included in this code fingerprint. The port-3000 browser follow-up tested `bc23f67` with clean status before server startup and no application-source changes.

### Completed independent checks

Run from the feature-worktree root. Exit codes/counts are actual observations, with earlier incomplete-install results preserved above.

| Command/check | Outcome | What it proves |
| --- | --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Exit 0; 858 packages | Clean lockfile installation with lifecycle scripts disabled; not an audit/security certification |
| `node --test Panda-agent/tests/*.test.mjs` | Exit 0; 149/149 tests, 0 failures | 148 existing offline tests plus one new preflight test; log in ignored `Panda-agent/infra/lightweight/artifacts/baseline-agent-tests.log` |
| `node --test Panda-agent/tests/lightweight-preflight.test.mjs` | Exit 0; 1/1 | Preflight's fixture self-check; independently repeated by Sol |
| `node Panda-agent/scripts/lightweight-preflight.mjs` | Expected exit 1; nine missing RPC definitions; Docker CLI unavailable | Clean-tree local SQL declaration gap; no database/provider contacted |
| `npm.cmd run lint` | Exit 0 | Existing lint passes |
| `npm.cmd run typecheck` | Exit 0 | Existing Next type generation / TypeScript passes |
| Production build through the launcher below, alternate `.next-lightweight-baseline` output | Exit 0; compile 62 s, TypeScript 105 s, 41/41 static pages | Unchanged application builds; unconstrained local sample only |

The missing runtime/chat declarations and history-publication guard failure are baseline findings, not passing feature contracts. See [exact fixtures, source map and dependency hashes](lightweight-baseline-review.md). Proposed selective dependency adoption is documented but **not executed**. No migration was applied or remote database schema/configuration changed.

### Browser evidence and observed failure

Full reproducible actions, roles, flags and limitations are in [the browser baseline](lightweight-browser-baseline.md). Environment is real local Web with the existing development Clerk/InsForge configuration, not a new fixture identity or hosted deployment. Provider inference was not reached.

- Development `http://localhost:3011/panda-agent`, existing authenticated owner in Codex IAB: workspace loaded, history `GET /api/panda-agent/chats` returned 503. One submitted question, `Which MCU does the x8266 listing name?`, reached chat-create `POST /api/panda-agent/chats` and returned 503. No messages POST reached the runtime. The visible `Could not create a chat. Refresh the page before trying again.` assertion passed. No answer/save/reload success is claimed. The question stayed visible and composer became disabled; usable draft recovery is not established.
- `PANDA_AGENT_LOCAL_WORKFLOW_ENABLED`, `PANDA_AGENT_TAVILY_ENABLED` and `PANDA_AGENT_NATIVE_STREAMING_ENABLED` were false. The new lightweight flag is not wired. No AWS tunnel/provider runtime started. Failure before messages POST plus source guards establishes no legacy call in this observed attempt, not a measured hosted provider trace.
- Separate Brave profile initially observed the anonymous 307 sign-in redirect and visible sign-in page. The user later signed in; a later sign-in-heading assertion was inconclusive and is **not PASS**. No session was created, changed or signed out by the agents.
- Sanitized screenshot with account sidebar hidden: ignored `Panda-agent/infra/lightweight/artifacts/baseline-chat-failure.jpg`. No tokens, cookies, private uploads or raw authenticated network archive were saved.
- Production `http://localhost:3012/panda-agent` preserved the existing read-only notice and disabled composer. Public `/` rendered normally. First local production startup reported 1,177 ms, one unconstrained sample only.

### Attempt 1 cold-JavaScript gate — recorded BLOCKED

Attempt 1 interpretation: actual initial JavaScript/network bytes for assistant and unrelated storefront route using the same account, a verified mobile viewport/network profile and controlled cold-cache procedure. The mobile requirement was mistakenly promoted from Phase 7; attempt 2 corrects that interpretation explicitly below. Actual cold initial JavaScript remains required by Phase 1.

Observed: supported CUA evaluation has no usable `performance.getEntriesByType`; advertised DOM asset inventories do not capture network timing/bytes. Requested 390 × 844 viewport did not apply: actual document width was 1,265 px and screenshots remained desktop sized; the override was cleared. Native DevTools fallback could not establish a controlled measurement window. These checks cannot establish cold initial transfer or mobile behavior.

An authorized local equivalent completed: browser-observed deduplicated same-origin static JS paths were fetched with gzip by the local server-side measurement script. `/panda-agent`: 20 JS elements, 1,835,227 raw body bytes, 567,142 response-body bytes, 19/20 gzip responses. `/`: 21 JS elements, 1,197,130 raw body bytes, 375,324 response-body bytes, 20/21 gzip responses. This is a **server payload inventory proxy**, not browser transfer, initial-only attribution, cold-cache, mobile, timing, third-party coverage or a feature delta. Sol independently agreed it does not pass the required gate.

Ignored evidence/calculation in `Panda-agent/infra/lightweight/artifacts/`: `assistant-script-inventory.json`, `storefront-script-inventory.json`, `measure-script-inventory.py`, `baseline-script-payloads.json`. They contain public static paths/aggregate sizes. Reproducing the proxy does not unblock actual browser transfer.

### Attempt outcome and signoff

**Phase 1 BLOCKED; last passing phase none; Phases 2–8 PENDING.** Independent offline/build and baseline failure checks are complete. Existing customer failure is a valid baseline observation, but the unavailable required cold-browser measurement is not skipped or marked PASS. Do not wire Phase 2 or mark the tracker COMPLETE while it remains missing.

Unblock with a supported network-capture surface or controlled native DevTools window for this branch's production build, preserving the existing user session. Confirm the actual mobile viewport, document the network profile and cold-cache procedure, then capture sanitized initial JavaScript request/encoded-byte aggregates on both routes. Do not export cookies or a raw authenticated HAR. Record actual transferred bytes separately from decoded/raw and synthetic gzip payload sizes. Rerun the last affected gate and relevant regressions, update this same tracker, and continue automatically only after Phase 1 PASS.

Docker's absence is a separate future container gate; pricing/free-provider compatibility, actual provider quota/cost, durable authenticated answer/reload, source fencing, project guide, image flow and resource targets are unverified. No provider/cloud/DB-schema/configuration write or runtime implementation occurred.

Prior-attempt cleanup before baseline checkpoint `bc23f67`: Root reported Ctrl-C stopped both task-owned development/production server sessions; IPv6-loopback connection checks confirmed ports 3011 and 3012 closed (exit 0). Bound task-owned application tabs were closed, the viewport override was cleared, and existing owner sessions were preserved. Temporary connection-error tabs were left to automatic cleanup. Root inspected the final sidebar-hidden screenshot and confirmed no account details were visible. The later port-3000 server below is intentionally running; this earlier cleanup is not its current process status.

Sol high contract/review signoff: the baseline evidence supports **BLOCKED**, not PASS or feature acceptance. Final checkpoint may be committed locally as authorized; no push/deploy is part of this stop.

## Port-3000 follow-up — 5 November 2026 (Asia/Kolkata)

The user explicitly requested inspection of existing localhost ports and hosting/testing on 3000 or 3001. Root started the same feature checkout at checkpoint `bc23f67`, clean before startup. Initial `netstat` queries were inconclusive, returning no matching listeners even after the server was known working. Direct socket-connect checks established port 3000 IPv4=false / IPv6=true and port 3001 IPv4=false / IPv6=false. Next reported ready in 9.0 seconds; task-owned exec session `84360` remains **running deliberately for the user**. Do not stop other processes. Agent IAB tab 6 is marked to keep open; comparison Home tab 7 was closed.

Observed real local development flow, existing owner session: `/panda-agent` returned 200; history GET remained 503. Sending `Which MCU does the x8266 listing name?` once produced chat-create POST 503 in 3.1 seconds. The exact visible failure assertion passed: `Could not create a chat. Refresh the page before trying again.` No messages POST, legacy selection or model work occurred. Sidebar-hidden screenshot: ignored `Panda-agent/infra/lightweight/artifacts/port-3000-chat-check.jpg`.

Root's independent HTTP checks: `/` returned 200; anonymous `/panda-agent` returned 307 to sign-in, then 200; anonymous `/api/panda-agent/chats` returned 401 with `private, no-store`. The connected browser rendered the actual Home heading/content and its heading-visible assertion passed. All three legacy/search/native flags remain false through the existing launcher. No runtime, dependency, credential, schema, cloud or commerce changes were made. Moving the port does not resolve the existing 503 or the required cold-JavaScript/mobile/cache gate: **Phase 1 remains BLOCKED; Phases 2–8 remain PENDING**.

Exact restart command, from this feature-worktree root, using the existing ignored launcher and locally provided original environment file (do not print/copy its contents):

```powershell
node Panda-agent/infra/lightweight/artifacts/launch-baseline.cjs 'E:\Web development\PROJECTS-FULL STACK\Pandabyte\.env.local' dev --hostname localhost --port 3000
```

The server is already running; use the active URL above before considering a restart. Root owns process/Git operations and will locally commit only this handoff update, without push or deployment.

## Phase 1 attempt 2 — started 5 November 2026 (Asia/Kolkata)

The user's latest instruction is to finish the remaining Phase 1 work before Phase 2. Tested starting branch HEAD: `a038fe3`, clean at attempt start. Phase 1 is reopened **IN PROGRESS**, last passing phase remains **none**, and Phases 2–8 remain **PENDING**. Earlier failed/blocked attempts are retained above, not retroactively passed.

Interpretation correction by Sol high: the exact Phase 1 browser instruction is to measure cold initial JavaScript on the assistant and an unrelated storefront page. It does **not** require a mobile viewport or a throttled network profile. The matched mobile/network-settings comparison and mobile long-thread exercise appear in Phase 7. We incorrectly made confirmed mobile width part of the Phase 1 blocker. Phase 1 can use the actual observed desktop viewport and ordinary network settings, recorded precisely for reproducibility; the later mobile gate stays open. This correction does not weaken the explicit Phase 1 actual cold-JavaScript requirement or turn the earlier server payload proxy into browser evidence.

Root preserves the user's development server on port 3000 / exec `84360` and started a separate task-owned production upstream on port 3012 / exec `80623`, using the existing `.next-lightweight-baseline` build from unchanged base application source. Terra high `terra_baseline_preflight` is reused with write scope **only** `Panda-agent/scripts/browser-baseline-proxy.mjs` and `Panda-agent/tests/browser-baseline-proxy.test.mjs`. Root owns launch/capture/process operations; Sol owns independent contract/methodology review and this tracker's final signoff. No application-source or dependency changes are authorized by this measurement attempt.

Planned diagnostic: a loopback-only port-3001 proxy to the owned port-3012 upstream. Pass static assets through raw HTTP without changing body bytes or content encoding. Inject a small early inline ResourceTiming observer into local test HTML and publish sanitized measurements as visible DOM. This is disclosed local test-server instrumentation, not a new runtime feature or unchanged HTML. Browser interaction uses ordinary CUA navigation only; no alternate CDP/browser driver. The test sensor can access real browser globals even where CUA's read-only evaluation scope does not expose `performance`.

Required proof before acceptance:

- Capture browser `transferSize`, `encodedBodySize`, `decodedBodySize`, initiation/end times and actual viewport/navigation settings during a declared initial-navigation window, without user interaction. Include static JS loaded by script, preload/link or import; keep each resource entry and separately report unique public paths.
- Establish cold fetches independently on **both** routes. A fresh origin only makes its first navigation cold; shared assets on a second route may be cached. Planned static no-store behavior and removal of conditional validators must be disclosed and verified with actual noncached browser entries plus matching proxy full-response counts. Cached/304/service-worker entries must not silently pass cold proof.
- Cross-check browser entries against sanitized proxy asset counters and encoded body sizes; verify original/proxied asset integrity. Raw asset passthrough avoids Node `fetch` auto-decompression corrupting or altering compression. Account inline probe bytes separately as HTML overhead; preserve CSP with only a narrowly permitted probe if necessary.
- Sum actual transfer entries rather than deduplicating network costs. Label browser-reported transfer sizes separately from encoded/decoded body sizes; these are not packet-level exact header/wire counts. Inventory third-party JS separately and mark opaque size visibility unknown, never zero.
- Persist only public static paths, aggregate counters and sanitized reports. Do not log/save cookies, credentials, private content, raw personalized HTML or authenticated network archives.

API references reviewed: [MDN transferSize](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize), [MDN encodedBodySize](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/encodedBodySize), [MDN PerformanceObserver](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver), and [W3C Resource Timing](https://www.w3.org/TR/resource-timing/).

At this attempt-start update the diagnostic implementation review, focused tests, live sensor capture, per-route cold proof and counters/integrity reconciliation are **PENDING**. No actual browser measurement result or Phase 1 PASS is claimed. Continue Phase 1, record exact commands/results and tested diff fingerprint here, and only after all Phase 1 exit evidence passes start Phase 2 automatically. Docker, real-provider, durable grounded-answer and mobile performance gates remain separate later requirements.

### Attempt 2 implementation review and latest scope update

The user subsequently replaced the old-harness repair proposal with the fresh-runtime scope at the top of this tracker and approved the existing AWS host if capacity permits. [The replacement contract](lightweight-replacement-contract.md) is the active source of scope and switch/rollback semantics. The current baseline branch remains the control; Root must create/verify the separate replacement branch before runtime edits. No application runtime source, cloud configuration or credentials were changed by this contract update.

Root confirmed `git diff --exit-code a3a4756...HEAD -- app components lib Panda-agent/src package.json package-lock.json next.config.ts tsconfig.json` exit 0. Existing production build ID: `V-qR-zG6OxeRKhaaXxngB`; package-lock hash remains the recorded `fa5b5ac83ce2636b0e361ba2f162d73571ce4e82712ff85009d31767f7db21e4`. Upstream port 3012 reported ready in 1,440 ms, one unconstrained sample. Additional pinned `skills@1.7.6` owner-filtered composition/web-design discovery exited 0; existing guidance reused, no install.

Proxy review found and fixed the missing pending-resource proof: sanitized started/completed/in-flight/failure/overflow counters now accompany completed asset hashes, with a held-response fixture. Root then found the actual application CSP in Clerk `proxy.ts` uses a strict server-issued nonce; the earlier injected script was present but blocked, so no capture passed. Latest diagnostic reuses that nonce only in memory, preserves CSP unchanged and neither logs nor persists the nonce. Strict-CSP and blocked-CSP fixtures cover the injection boundary. No security policy was relaxed. A current anonymous CLI attempt reached an external Clerk/Cloudflare challenge; no bypass was attempted and this is not a new anonymous-browser pass.

Sol independently reread the nonce/counter helper and ran `node --test Panda-agent/tests/browser-baseline-proxy.test.mjs`: exit 0, **3/3 pass**, no skips. Raw compressed asset bytes/hash checks, original CSP/Host forwarding, RSC non-reset behavior, bounds and pending counters are covered; no helper edits by Sol. The sensor's positive-transfer flag alone is not cold proof: acceptance still needs each route's browser/proxy entry reconciliation, all asset status 200/full body, zero in-flight/failures/overflow/cache/SW evidence and matching build hashes. **Live capture and Phase 1 PASS remain pending** at this update.

Root's narrowly scoped AWS CLI/STS/EC2 and read-only SSM checks verified the approved target; sanitized identity/capacity details and preservation gates are in the replacement contract. Read-only SSM ran successfully; no host-state mutation, container start/stop, resize or new host provisioning was performed. Existing hosted gateway/data remain preserved. AWS hosting approval does not authorize paid inference; the fresh runtime retains hard zero-paid routing and honest unavailable outcomes.

### Attempt 2 actual results and final-check status

Real browser captures and independent reconciliation are complete. See [measured browser baseline and limits](lightweight-browser-baseline.md) and [sanitized verification summary](verification/lightweight-phase1-20261105.json). Both routes used Chrome 156 on Windows, observed 1280 × 720 desktop viewport, ordinary unthrottled loopback, same authorized account and unchanged production build `V-qR-zG6OxeRKhaaXxngB`. No user interaction occurred during the declared initial capture windows.

| Route | JS entries | Encoded body bytes | Browser-reported transferSize | Decoded body bytes | Load event end / cutoff (ms) |
| --- | ---: | ---: | ---: | ---: | --- |
| `/panda-agent` | 19 | 527,515 | 533,215 | 1,722,633 | 3,922.2 / 7,632.2 |
| `/` | 20 | 335,697 | 341,697 | 1,084,536 | 3,629.7 / 10,434.0 |

For each route, Sol independently asserted exact browser/proxy `(public path, encoded/raw body bytes)` multisets, positive browser transfer/encoded values, 19/20 started=completed=entries, all full status-200 bodies, no pending/failure/overflow/error, and decoded hashes recomputed against the actual build files. Root's aggregate reconciliation matches; independent Python exit 0. Each report has a 3,000-ms quiet window and 4,115 inline probe HTML bytes excluded from JS totals. Reports and hashes are retained as summarized in the linked JSON; no raw headers/cookies/nonces/private content is committed.

All entries have positive `workerStart`. The raw collector worker-free `positiveTransfer`/`cacheMissEvidence` flags remain **false**, not overwritten. The brief does not require worker-free navigation; full-network response/counter/byte/hash proof supports the explicitly labeled **worker-mediated, fully network-fetched first-party initial JS** baseline. This is not proof of a globally empty cache, direct/no-worker navigation or packet-level wire totals. Each route separately has nine third-party script entries with zero visible transferSize and 240,179 visible encoded / 809,251 decoded bytes, one zero-encoded entry; opaque/cache ambiguity is unresolved and excluded from cold first-party totals. No whole-page or mobile cold-load claim.

Final regression `node --test Panda-agent/tests/*.test.mjs`: Root reports exit 0, **152/152 pass, 0 fail, 0 skip**, 33.1 s; ignored `Panda-agent/infra/lightweight/artifacts/phase1-final-tests.log`. Focused proxy tests independently pass 3/3; focused ESLint on the two helper files exits 0. Full `npm.cmd run lint` initially found only the ignored generated launcher `.cjs` (`no-require-imports`); Root added exactly `Panda-agent/**/artifacts/**` to `eslint.config.mjs` global ignores, matching existing ignored evidence/operator directories. Sol inspected that one-line tooling diff; committed helper/tests remain linted. **Full-lint rerun then exited 0 with no errors.** No application runtime source changed; this tooling config change is included explicitly in the checkpoint. Earlier typecheck and production-build exit-0 evidence still applies to the unchanged application source.

Root stopped only diagnostic proxy 56954 and production upstream 80623 after evidence. IPv6-loopback probes passed: 3000=true, 3001=false, 3012=false. User development server 84360 stays up; diagnostic Agent/Home tabs 9/10 closed after ignored `cold-agent-screen.jpg` / `cold-home-screen.jpg` screenshots. No account session changed. AWS capacity reads created only the managed SSM command record; existing gateway/data were untouched.

To reproduce the instrumented control, start the production upstream with the recorded launcher/build settings, then run `node Panda-agent/scripts/browser-baseline-proxy.mjs` from this worktree root. In ordinary CUA navigate to `http://localhost:3001/panda-agent`, wait for visible `LOCAL MEASUREMENT` report, save only the sanitized report and `GET /__panda-baseline/report` counters; repeat independently on `/`. Do not treat the sensor flags alone as acceptance: rerun the per-entry counter/status/hash reconciliation, retain worker/third-party limitations, and never export authenticated HTML/headers or a HAR. Stop only task-owned diagnostic processes afterward; keep the user-requested port-3000 server running.

### Attempt 2 outcome — Phase 1 PASS

Sol high final review/signoff: **Phase 1 PASS; last passing phase 1.** The isolated base/control, source map, first failures, scoped dependency-resolution contract, relevant tests/build/typecheck/lint, real anonymous/authenticated baseline observations, flag design and actual first-party cold-network JavaScript measurement have evidence. The mobile criterion was corrected explicitly rather than skipped; worker-mediated and third-party limitations remain in the raw/sanitized reports. Earlier 503 failures remain baseline findings, not repaired or represented as successful answers.

The seven intended checkpoint files are `Panda-agent/scripts/browser-baseline-proxy.mjs`, `Panda-agent/tests/browser-baseline-proxy.test.mjs`, `Panda-agent/docs/lightweight-browser-baseline.md`, this handoff, `Panda-agent/docs/lightweight-replacement-contract.md`, `Panda-agent/docs/verification/lightweight-phase1-20261105.json`, and `eslint.config.mjs`. The helper/test raw SHA-256 values and ignored input-report hashes are in the sanitized verification JSON; baseline application source still equals the requested base. Root owns exact-file staging/local commit and the next separate branch; no push or deployment has happened here.

**Phase 2 remains PENDING, preparing contracts/checkpoint**, until Root records the Phase 1 commit and creates/verifies the fresh-replacement branch. Then record Phase 2 start before assigning disjoint Terra scopes and continue automatically. Phase 1 PASS does not accept a new runtime/model, grounded saved answer, source fencing, Docker/resource target, free-provider quota, mobile regression or AWS deployment. The existing-host target is approved if capacity permits; build/tests/capacity/gateway-preservation checks precede a new-service deployment.

## Resume

Verify this branch and worktree with `git status --short`, `git branch --show-current`, and `git rev-parse HEAD`. Read this attempt and both linked review documents before resuming. Preserve all original dirty-checkout work. Do not silently import the release worktree or use its Admin comparison route as the customer tool.

Exact local commands below run from `C:/Users/rajra/.codex/worktrees/panda-agent-lightweight-rag/Pandabyte`. The environment file is provided locally from the existing checkout only; never copy, print or commit its contents. If the ignored launcher is absent after checkout, recreate **only** `Panda-agent/infra/lightweight/artifacts/launch-baseline.cjs` with the following content (create its ignored parent directory as needed):

```javascript
process.loadEnvFile(process.argv[2]);
delete process.env.NODE_OPTIONS;
process.env.PANDA_AGENT_LOCAL_WORKFLOW_ENABLED = 'false';
process.env.PANDA_AGENT_TAVILY_ENABLED = 'false';
process.env.PANDA_AGENT_NATIVE_STREAMING_ENABLED = 'false';
process.argv = [process.execPath, require.resolve('next/dist/bin/next'), ...process.argv.slice(3)];
require('next/dist/bin/next');
```

Dependency/fixture checks and development server:

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
node --test Panda-agent/tests/*.test.mjs
node Panda-agent/scripts/lightweight-preflight.mjs
# Expected current preflight exit: 1; nine missing local RPC declarations.
npm.cmd run lint
npm.cmd run typecheck
node Panda-agent/infra/lightweight/artifacts/launch-baseline.cjs 'E:\Web development\PROJECTS-FULL STACK\Pandabyte\.env.local' dev --hostname localhost --port 3011
```

Stop only the task-owned development process when finished. For the production baseline, build first, then start in the same environment:

```powershell
$env:PANDABYTE_NEXT_DIST_DIR = '.next-lightweight-baseline'
node Panda-agent/infra/lightweight/artifacts/launch-baseline.cjs 'E:\Web development\PROJECTS-FULL STACK\Pandabyte\.env.local' build
node Panda-agent/infra/lightweight/artifacts/launch-baseline.cjs 'E:\Web development\PROJECTS-FULL STACK\Pandabyte\.env.local' start --hostname localhost --port 3012
```

Next may add generated alternate-directory includes to `tsconfig.json`; inspect the diff and restore only those task-generated changes, preserving any new user edits. Do not reset/stash the checkout. Confirm the build remains based on the tested source before measuring. Use `http://localhost:3012/panda-agent` and `http://localhost:3012/` for matched production browser captures; the existing production read-only guard is expected. Use the development route on 3011 only to reproduce the documented baseline failure. No flag is enabled to make it appear successful.
