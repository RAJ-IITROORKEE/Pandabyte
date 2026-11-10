# Phase B review and execution record

Updated: 11 November 2026. **B is accepted for its synthetic execution scope.** The branch remains isolated; no research profile is enabled in the live web app.

The owner approved Overview & Goals, technical planning and stepwise implementation. A passed as `2ff4a72` plus strict-check follow-up `c211159`. B's exact plan is [phase-b-plan.md](phase-b-plan.md).

## Goldfish review

A fresh Implementation Readiness reviewer read the bundled persona/standard, full B plan and selected source. Five initial Major gaps concerned provider-frontier determinism, restart terminalization, source/cancel transitions, host capacity/private layout and executable contracts. The freeze resolved them. A final Major clarified that exact already-sent results may settle privately after cancel/rotation without release eligibility. Recheck reported no remaining Blocker/Major in scoped readiness.

Two fresh source reviewers read the bundled Codebase Details persona, implementation-readiness standard, frozen plan and implementation. Store/gateway review found no independent authority bypass. Caller/test findings included wrong `claimPrompt` result handling, retirement racing prompt acknowledgement, a simulated503 mislabeled physical disconnect, and receipt recovery while still current. These were repaired: inspect the dispatch observation; permit only verified settled source retirement after the admission race; kill only the generation/token/PID-verified channel helper before forwarding; recover after finish while current remains false.

Runtime review found incomplete loaded-config validation, an undersized double-escaped wire cap and incorrect native config wire fixtures. The verifier now checks the exact tagged2.2.5 document/directory/document inventory and complete contents; only config is a raw HTTP array. Proxy wire bound is200704 bytes, with an actual subprocess/loopback quote-heavy regression. Review rechecks reported no remaining Blocker/Major in those scoped repairs. These are targeted reviews, not formal five-stage EGM convergence or native acceptance.

## Local verification

- Focused B suite initially52, then54 passing tests with no skips after source-review regressions. The image-metadata regression later adds one more case; rerun at B close.
- Direct strict TypeScript explicitly includes unconnected new modules; app tsconfig alone cannot establish their type safety. Passed.
- Configured server suite:1031 total,999 passed, zero failed,32 existing skips. Client dictation separately:2 passed. The client suite uses normal React; server-only checks use the react-server condition. The earlier incompatible combined invocation and stale assembly test failures were diagnosed rather than hidden.
- The stale assembly fixture now tests current main's direct-only flag and proves historical native flags cannot enable inference. Runtime routing did not change.
- Default Next.js production build passed. Scoped lint passed with one initial caller-style warning; the warning was subsequently removed. Final checks follow actual native repairs.

## AWS execution evidence so far

AWS CLI authentication expired before source upload. The owner approved `aws login`; initial stale-session/browser DNS failures and a manual remote exchange did not produce usable local credentials. After the owner changed network/DNS, automatic callback login succeeded. STS verified the existing Datumm account and SSM reported the selected instance online. No OAuth URL/code, cache contents or credential values belong in repository evidence.

The SSM shell did not have Node in PATH. Selected service-process metadata identified the existing executable `/opt/panda-agent/hosted-runtime/bin/node`, version24.22.2. No runtime was installed or upgraded.

| Attempt | Result | Dispatch/cleanup |
| --- | --- | --- |
| `72544569-0656-43a8-8ece-fcf2fd516525` | Shell could not find node; application did not start | Zero model/search calls; no native container |
| `5374fafd-4048-4623-b4f1-002230f70fb3` | Exact-image container inspection rejected inherited metadata before start | Zero provider/tool dispatches; exact owned container removed and host slot freed |
| `59e18929-f885-4dd1-ada2-e9350940f42e` | Channel attachment stopped because root umask077 made the read-only code files0400 | Zero provider/tool dispatches; exact owned container removed |
| `0947d17d-30b5-44ca-b643-3f4d3e4c3ce8` | Native2.2.5 booted, loaded config matched and session was created; first prompt did not settle successfully | Zero provider/tool dispatches; exact owned container removed; private native state retained |

Read-only image metadata showed three inherited build labels and NODE_ENV in addition to the image's PATH/Node/Yarn variables. The verifier now compares the exact image-derived baseline plus the three owned labels and fresh channel credentials. It accepts no unknown label/environment override. The sole caller obtains that baseline from Docker inspection of the immutable ARM64 image. A fresh source recheck reported no Blocker/Major in this correction.

Read-only mode inspection confirmed0400 on the mounted code and manifest. The fixture now explicitly chmods read-only code/manifest0444 after exclusive writes; native writable data remains private10001:10001 mode0700, and host authority remains private to its host owner.

All fixture directories and unknown states are retained privately. The working hosted lightweight gateway, its services/configuration, historical native/search ledgers and owner data are untouched. Real provider and real Tavily calls remain zero for B. The next native attempt and its safe diagnostics must settle the first-prompt boundary before the remaining matrix or C can advance.

## Exact-image protocol repairs, 11 November

The subsequent zero-cost fixtures reached native execution in stages:

| Attempt | Observed boundary | Result |
| --- | --- | --- |
| `5163e139-b222-49d5-9dcf-8a04c1146d6c` | Provider request rejected before host dispatch | Tagged native configuration requires a plugin directory. Moved the same reviewed binding to `research-binding/index.ts`; no dependency added. |
| `bde57709-240b-4bd4-a843-802838fbd825` | Trusted plugin headers reached the host; request400 | Native2.2.5 sends `max_completion_tokens:1024`. The bounded gateway now accepts that spelling or legacy `max_tokens`, rejecting both together. Two focused regressions passed. |
| `a6e63ac2-7b30-49f0-b717-f617dc4d8db4` and `01b0438c-26b8-4306-b37f-c5bff1c60f0c` | One synthetic model dispatch and one native MCP tool execution; fresh shim duplicate returned cached result; continuation403 | The script passed a complete saved record to authority methods requiring exactly `{kind,key,requestHash}`. Narrowed recovery/association/recovery-check inputs without weakening authority validation. |

Each failed fixture removed only its owned container, verified absence and released its host slot; private histories remain retained. Actual native timestamps also showed that idle preserves the work-update clock. Commit `3a7db6b` corrects A's independent clock bounds against tagged native projector source, with its regression and fresh Goldfish source review.

The focused B suite now reports **58 passed, zero failed, zero skipped**. One invocation from the wrong working directory was interrupted because subprocess fixture paths require the repository root; the successful result uses that root. Native typechecking now explicitly includes research server modules and the directory plugin, so future checks cannot silently omit this unconnected phase. No real model or Tavily traffic has occurred.

## Final B gate

Command `0f1b6ed5-086a-40bb-93c6-7abcaeea95a2` passed all13 exact-image checks in69099ms: native tool continuation, cached fresh-shim duplicate, read-only settled recovery, multiple turns, persistence/restart reconciliation, unknown replay fencing, two-owner isolation, synthetic429, physical settled channel disconnect, source retirement, claim-before-send disconnect and lost container-create receipt cleanup. Nine synthetic model dispatches and one synthetic tool dispatch occurred; real provider/search calls were zero. Unknown histories remain retained privately. The script's `initial_smoke_passed/fullPhaseBGate:false` is only its runtime observation; this reviewed document and combined verification record close the larger B gate.

The final fresh Goldfish source review found two Majors: uncertain Docker creation could release capacity without verified cleanup, and two documented bootstrap signatures omitted generation. Both are resolved. Creation is marked uncertain before dispatch; cleanup discovers the exact lease name, verifies immutable image and all three owned labels, removes the matching container and verifies absence before releasing capacity. If no candidate can be verified, it retains the slot. The added actual lost-response scenario tests this path before native start. The review recheck reported no remaining Blocker/Major in these repairs. Frozen signatures now match the actual generation arguments.

Final server regression suite:1036 total,1004 passed, zero failed,32 existing opt-in skips. Client dictation:2 passed. Focused B:58 passed, no skips. Expanded native TypeScript and scoped lint passed. The default production build passed before the final caller-only repairs; no application UI/routing changed afterward. Post-run read-only health command `db15ebc1-34fc-44b6-926d-c46797b359f0` verified the working gateway active, lightweight container healthy and native slot free. See [combined receipt](phase-b-verification.json).

C can now begin with its own detailed contract and readiness review. B does not establish Tavily key validity, real-model receipt/accounting, canonical chat persistence, live browser integration, questions, compaction or complete web-harness acceptance. No main merge/push/research deployment has occurred.
