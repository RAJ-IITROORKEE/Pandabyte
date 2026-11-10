# Hosted provider selection — 10 November 2026

The slow incident included a 19,862 ms provider round trip inside a 23,895 ms main-chat request. Another main-chat follow-up needed 6,122 ms with only 1,114 ms at the provider. Both provider variance and application admission, source checks and persistence contribute; changing models cannot eliminate the latter.

The selected hosted candidate is `openai/gpt-oss-20b`, pinned to Groq through OpenRouter, with no provider fallback or inference retry. Listed endpoint rates verified during selection: $0.075 per million input tokens, $0.30 per million output tokens and $0.0375 per million cached input tokens. Low reasoning is excluded from responses but included in bounded token/cost receipts. ZDR eligibility is checked before every dispatch. Native/local Luna profiles and their ledger remain unchanged. Hosted owner testing has no cumulative application budget cap; per-request input/output and receipt validation remain.

## Measured comparison

Identical quote-ID/JSON-schema prompts were interleaved for three rounds of three public-source cases: xC3 specifications, x8266 MCU/USB and unsupported physical revision. These are small diagnostic samples, not a throughput load test or p95/SLA.

| Route | Accepted cases | Median provider request | Range | Cost for nine calls |
| --- | --- | --- | --- | --- |
| Luna / Azure US | 9/9 | 1,893 ms | 1,025–5,158 ms | $0.00120252 |
| GPT-OSS 20B / Groq | 9/9 | 637 ms | 258–3,204 ms | $0.00092685 |

The selected route was about 23% cheaper across these nine matched cases. Two Groq cases required validated repeated-quote-ID deduplication; this is not 9/9 raw protocol compliance. Citation text is always restored from exact source bytes. Fact-check comparisons permit typographic hyphen differences in answers, never in citations. Earlier shortlist probes included unsupported reasoning-parameter rejections, literal quotation errors, truncation and timeouts across Luna, GLM/Wafer/Morph, GPT-OSS/Groq, Llama/DeepInfra and Qwen/Nebius. Failed and unknown calls were retained privately and were not automatically retried. A Gemini route was excluded because the reviewed endpoint set did not establish the required privacy eligibility.

An additional actual-adapter RAG probe took 3,433 ms at Groq, so the faster median is not a maximum. Its direct-chat probe took 554 ms. Nonstreaming first-token telemetry can equal the entire response duration; it is not proof of true generated-token TTFT or decoding throughput.

## Correctness and observation boundaries

Hosted RAG sends the full bounded selected context as allowlisted exact source excerpts with opaque local quote IDs. Every selected ID and reason is validated, resolved to original source text and checked through the existing freshness/evidence workflow. Unknown or malformed IDs fail closed; no text is released before the final valid provider receipt. Empty evidence withholds unsupported answer text. The model can still make an inference error: literal citation membership does not establish answer entailment.

Manual review found that the first unpromoted candidate incorrectly linked clock frequency to electrical power. The corrected prompt keeps independently labeled specifications and separates clock from supply voltage. Six fresh specification/power calls passed the focused regression checks. This failed sample remains part of the acceptance history.

Private `[hosted-llm]` observations cover each actual transport invocation, including failures: independent observation ID, provider generation ID, model/provider, stage, metadata/admission/first-content/provider/total durations, HTTP status, token counts and cost. Logs contain no prompt, answer, customer/chat IDs, headers or credentials. Groq may buffer content, so first-content timing means the observed wire event, not hardware token latency. Application/source/save timings remain separately observable.

OpenRouter's existing LangSmith destination was verified in the browser: 100% sampling for the application key, Privacy Mode enabled, prompt/completion logging disabled and cost metadata enabled. Actual delivered benchmark traces had no inputs and only usage output, with model/provider/timing metadata. Upstream base metadata can still contain account identity, so raw trace exports are not published.

## Verification before promotion

442 affected server tests and 22 UI/composer/queue tests passed, including the two existing frozen 20-case retrieval checks. TypeScript, scoped ESLint and the initial candidate build passed. Eight affected provider/workflow tests passed again after the specification prompt correction. Independent fresh-context EGM review found and rechecked repairs for metered-policy reuse and model-selection snapshot drift; this is a targeted review, not full five-stage convergence.

Corrected candidate and live browser results, deployment and publication receipts are appended after verification. No general guarantee of sub-two-second full generated answers is implied by document retrieval measurements.

## Corrected candidate browser review

Runtime d89140b, deployment `dpl_9263sdYhMbpgw4qvwVL71LPxDsiZ`, was tested before promotion. Control Room specifications and explicit power-versus-clock answers were manually correct; the exact physical-revision question withheld an unsupported answer with no evidence. Browser HTTP times were 3,346 ms, 3,250 ms and the separately recorded abstention receipt. Their provider round trips were 588, 621 and 1,464 ms. Main xC3 specifications completed in 4,995 ms (provider 679 ms, retrieval 233 ms, context frame at 1,003 ms); Bluetooth follow-up completed in 5,499 ms (provider 629 ms, retrieval 205 ms, context at 983 ms). A follow-up draft remained editable and survived the first generation.

The exact Control Room specifications generation ID was matched privately to the delivered LangSmith trace. Input/output counts matched (1,245/269), actual trace inputs were absent and output contained usage metadata only. Trace cost matched $0.000174075. No raw generation identifier or trace export is published.

General project planning and Friday-to-Tuesday correction passed direct chat. Explicit recall also returned GreenPanda/Tuesday. A differently phrased question, “my project name and its current deadline,” exposed an existing router error: `its` caused a generic project-memory question to be treated as hardware context and receive a product clarification. This failure is retained; a narrow routing repair and its browser acceptance are required before promotion. Initial project messages mentioning hardware model names also retain the existing source-routing behavior; model swapping does not grant unsupported board facts.

## Final release and primary-domain acceptance

Runtime **739e0da92f66819c580fbe6ed27e89eac74e831a** is live at [Panda Agent](https://pandabyte-iot.vercel.app/panda-agent) and [Control Room](https://pandabyte-iot.vercel.app/admin/rag-control-room#playground), deployment **dpl_ADhJaJJ19NtUhUzyH8ffPwWHV8zR**. The final candidate passed actual corrected-memory recall, fresh main xC3 specifications and Control Room x8266 MCU/USB before promotion. Independent targeted EGM review found no Blocker/Major in the narrow routing repair. Actual known/unknown product identities and mixed hardware questions keep the grounded route. Main and generic classifier tests cover the exact failing wording and negative cases; this is deliberately narrow grammar, not arbitrary semantic intent detection.

Final affected verification: **450 server + 22 UI/composer/queue tests passed (472 total), no failures or skips**. The expanded server run includes the frozen retrieval cases. TypeScript, scoped lint and the production build passed. The hosted Evaluation pack and full native/OpenCode acceptance remain separate; these results are not twenty fresh live model answers.

| Primary-domain case | Browser HTTP total | Provider round trip | Context ready |
| --- | ---: | ---: | ---: |
| x8266 documents only | 679 ms | no call | server elapsed 356 ms |
| Main xC3 specifications | 4,927 ms | 779 ms | 773 ms (retrieval 206 ms) |
| Main Bluetooth follow-up | 7,912 ms | 3,329 ms | 831 ms (retrieval 112 ms) |
| Control Room x8266 MCU/USB | 4,180 ms | 2,061 ms | included in total |
| Control Room unsupported physical revision | 2,761 ms | 391 ms | included in total |
| Main exact corrected project-memory wording | 3,171 ms | 272 ms | no retrieval needed |

Main messages start at their message POST, excluding any preceding chat creation. Current source citations were present; both positive Control Room evidence sets matched exact retrieved passages. Unsupported physical revision withheld the answer. A draft was editable during real live generation and survived completion; saved cited turns survived reload. Main exact project-memory wording now correctly recalled GreenPanda/Tuesday on the primary domain. No cumulative hosted application budget cap was added.

All five primary-domain model calls had validated private application observations and appeared as actual LangSmith rows with matching token counts. The slow follow-up's generation ID was additionally matched exactly to its delivered trace: 1,659 input / 127 output tokens, 3,329 ms application-observed provider time, no inputs and usage-only output. Upstream trace latency was about 3.31 seconds. This establishes that the retained 7.91-second case contains a real provider delay as well as roughly 4.58 seconds outside that round trip. The latter includes network, admission, current source/history validation and persistence; it is not all model inference. Tracing delivery is asynchronous.

The model route improves the measured provider median and cost, but a full-answer maximum of two seconds has not been achieved or promised. Document/context retrieval met the requested two-second target in these measurements. Unknown/provider failures still do not trigger an automatic charged retry.

The [numeric receipt](../verification/fast-provider-20261110.json) retains the comparison phases, failed cases, focused quality checks and live timings without prompts, answers, credentials or raw generation/customer identifiers. Earlier sections document intermediate gates; this release section supersedes their pending status. Screenshots remain outside the public repository.

Official references: [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), [LangSmith broadcast](https://openrouter.ai/docs/guides/features/broadcast/langsmith).
