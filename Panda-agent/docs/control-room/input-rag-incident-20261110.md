# Live input and grounded-answer incident repair — 10 November 2026

The input and grounding repair is live at [Panda Agent](https://pandabyte-iot.vercel.app/panda-agent) and [Control Room](https://pandabyte-iot.vercel.app/admin/rag-control-room#playground), deployment `dpl_6gfexKchKs4VYVWMBzwEaRkdSfX3`, runtime source `2580c56add4771fe481560687d93092e384ee671`. It was built from the isolated reviewed checkout and promoted only after candidate browser checks passed. Hosted owner/Admin testing remains without an application budget cap; existing provider/privacy, source/access, claim and receipt guards remain. No database migration or original local/native ledger change was made.

## Confirmed causes and changes

- The UI applied send restrictions to drafting. A pending/blocked request therefore disabled typing even with the model Ready. Drafting is now separate from sending; status/cancellation preserve a typed follow-up, genuine chat changes clear it, and bounded capability/history/cancel operations release their busy state. Sending and queue limits remain guarded.
- Actual xC3 specifications requests failed exact evidence validation: first whitespace-only quote differences, then several distinct quotes from one passage. Luna now maps unique whitespace-equivalent quotations back to the exact source substring, then runs strict validation. Changed facts/punctuation/Unicode forms and ambiguous matches still reject. Distinct `(rank, quote)` pairs may share a passage; identical pairs, more than four entries and all existing bounds still reject. Main/workflow callers preserve every quote; legacy handle selection remains conservative.
- Fully received rejected content previously became an unknown outcome and left main chat pending indefinitely. After a valid Luna RAG receipt only, `response_rejected` now saves the existing safe unavailable response while retaining its claim. Ambiguous transport/receipt/truncation outcomes remain guarded. Control Room distinguishes rejected from unknown output across reload and permits an explicitly separate new test, without retrying the old request.
- Overlapping matching live-session checks share only an in-flight promise; completed results are never cached. Independent authorization pairs run concurrently while fresh source/history boundaries remain. Safe fixed stage labels distinguish application admission from model delay without logging prompts, responses, identifiers or credentials.

## Verification

415 affected server tests and 9 installed-SDK composer tests passed, zero failures/skips. Both original frozen 20-case retrieval regressions passed with the unchanged private pack. TypeScript, scoped ESLint and the production build passed. Composed regressions cover real transport → main/workflow validation, four distinct same-passage quotations, duplicate/absent evidence rejection, consumed claims, terminal safe responses and status-only replay without another POST.

Candidate and primary-domain signed-in browser tests verified xC3 specifications, the original `geeky board xc3` question, Bluetooth follow-up, x8266 MCU/USB, exact source quotes, drafting during real generation, saved reload and unsupported physical-revision abstention. An existing blocked chat allowed drafting while Send stayed disabled; Check status preserved it and New chat cleared it. Rejected-output state persisted across reload; separate-test acknowledgement made zero generation POSTs.

| Primary-domain request | Browser HTTP duration | Additional evidence |
| --- | ---: | --- |
| xC3 documents only | 687 ms | 3 passages; server elapsed350ms |
| x8266 documents only | 853 ms | 4 passages; server elapsed291ms |
| Original xC3 main question | 23,895 ms | First stream data987ms; retrieval178ms; provider19,862ms |
| Main Bluetooth follow-up | 6,122 ms | First stream data1,055ms; retrieval220ms; provider1,114ms |
| Control Room xC3 specifications | 6,025 ms | 4 exact quotations; provider3,479ms |
| Control Room x8266 MCU/USB | 3,670 ms | 2 exact quotations; provider1,555ms |

Message timings start at the message POST and exclude any preceding chat-creation request. The stream emits its context frame before provider metadata/admission. These are sequential observed samples, not a hard SLA. The retrieval target passed in the measured live cases; provider latency remains variable, including the explicitly retained slow outlier. No fast complete-answer guarantee is claimed.

Two fresh-context Goldfish audits identified input/latency risks. A third repair reviewer found a draft-isolation regression and inaccurate no-request wording; both were fixed and rechecked. It then reviewed terminal rejection, literal reconciliation, the pair contract and caller/UI changes without a remaining blocker/major. This was a targeted incident review, not five-stage EGM convergence.

The [numeric receipt](../verification/input-rag-incident-20261110.json) contains timings and bounded metadata only. Screenshots remain outside the public repository. The private answer-key pack remains local, so the hosted Evaluation runner is not configured by this repair. Frozen retrieval tests are not 20 fresh live model answers. Full native/OpenCode harness acceptance remains separate.
