# LangGraph product comparison workflow — 4 November 2026

## Cause and scope

The reported question, “Does PandaByte xC3 or xS3 have 8 MB PSRAM?”, hit the existing single-product identity resolver. That resolver intentionally returned conflict for two recognized products. The screenshot also had evaluation unchecked and the model connection unconfigured, so no LLM answer was requested. These are separate conditions.

This application checkpoint adds a local LangGraph workflow to the Admin Playground. It does not replace or activate the Research chat’s separately frozen native OpenCode runtime, change its financial authority, provision a vector database, re-embed the corpus, or deploy the frontend.

## Implemented workflow

The server resolves up to three exact catalog identities or globally unambiguous model aliases. It reads the complete current user-scoped catalog; ambiguous families and unresolved explicit comparisons request clarification. Each identified product uses its own canonical adapter instance and the existing answer pipeline to validate current approved source membership, text hashes, rights, blocked chunks and version fingerprints. Independent product reads run concurrently with a three-product bound.

A conservative product-choice check also clarifies an unresolved ordinary-name target such as “xC3 or Arduino Uno have…”; it preserves property alternatives such as “xC3 have WiFi or Bluetooth.” This bounded grammar does not establish general natural-language entity recognition.

The context merge alternates between products, preserving separate provenance even when body text is identical. It admits at most eight passages and 20,000 characters. Product titles/SKUs are metadata alongside untouched source text. Source fingerprints and the single-product legacy binding remain private.

The real `@langchain/langgraph` StateGraph runs authorize → retrieve → augment → generate → validate → release. LangChain Document objects preserve product/source metadata separately from their body text. Graph state contains only a numeric step; questions, sources and results remain in request-local closures. There is no checkpoint, resume, retry policy or paid fan-out. The completion callback has a one-attempt fence.

Generation uses the existing guarded callback only for a supported context profile. A single-product operation must match the existing private ordered text/provenance binding before the old receiver can send. Multiple-product generation remains unconfigured: the workflow returns its tagged retrieval and an explicit reason without forwarding it to a one-SKU receiver. No browser-supplied model, price, permission or scope becomes authority. Unknown outcomes, quota and known non-admission remain distinct, with no automatic retry.

Literal quote validation checks the source body for the cited rank. A fresh Admin/catalog/source check precedes final release. Withdrawal, identity changes, session/role loss or abort withhold the result. Pure Document construction and JSON formatting do not repeat network reads; source checks remain at preparation, before any model send, and release. A shared bounded deadline covers streamed request parsing and graph execution.

## Tracing and dependencies

Exact runtime dependencies are `@langchain/langgraph@1.6.1`, `@langchain/core@1.3.4` and `langsmith@0.11.8`. Scripts were disabled during installation. The saved preinstall and updated locks both report the same 16 moderate advisories, with no high/critical or newly flagged SDK dependency. Full MIT notices for all 17 newly added package paths are retained in `docs/licenses/langgraph-sdk-dependencies.txt`; existing advisories were not automatically rewritten or suppressed.

An adversarial offline test found an attempted LangSmith request with ambient tracing enabled despite a disabled traceable wrapper. The fetch stub blocked the request; only synthetic fixtures were used. The implementation removes that wrapper and refuses enabled tracing/verbose flags, active inherited tracing, or automatic callback handlers before running graph work. Network-blocked tests cover all tracing flag spellings, a standalone synthetic key and an inherited run tree. No LangSmith service or tracing is enabled.

The official MIT `langchain-rag` skill is installed narrowly at `.agents/skills/langchain-rag`, pinned to commit `126c384d8552dcb476b226c244172186cc3f4328`. Its examples do not override PandaByte’s Clerk, InsForge, source or financial contracts. AnythingLLM’s documented custom skills are runtime plugins, so no AnythingLLM plugin or second application was installed. Its ingestion/retrieval patterns were reviewed as a reference.

Primary references: [LangGraph Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), [AnythingLLM custom skills](https://docs.anythingllm.com/agent/custom/developer-guide), [AnythingLLM document retrieval](https://docs.anythingllm.com/chatting-with-documents/introduction), [pinned LangChain RAG skill](https://github.com/langchain-ai/langchain-skills/blob/126c384d8552dcb476b226c244172186cc3f4328/config/skills/langchain-rag/SKILL.md).

## Verification and remaining work

Twenty-seven focused offline tests pass for planning, actual SDK execution, quote attribution, privacy, cancellation, body bounds, revocation and guarded outcomes. The earlier combined 134-test source run passed; the two added unknown-choice regressions also pass. TypeScript, scoped ESLint and the final isolated production build pass. All 146 server file traces contain zero excluded credential/config paths. In the clean review checkout, 17 focused tests pass and ten private-catalog fixtures skip because private artifacts are intentionally absent; all 27 pass in the main workspace. These injected completion fixtures are not real model-answer acceptance.

In the signed-in Codex browser on localhost:3007, the exact reported question changed from conflict/zero passages to retrieved/five passages, tagged independently for ESPXC3 and ESPXS3. The xS3 source includes the captured 8 MB PSRAM claim; the returned xC3 context does not establish that specification. Missing evidence must never become a claim that the physical board lacks a feature. Source links and capture locators were inspected, including the current public xS3 page confirming 8 MB PSRAM and 16 MB flash. A separate signed-in single-product PBDHT11 query returned four tagged passages in 12,790 ms, including the captured temperature range of 0–50°C. Both browser runs were retrieval-only and made no model call. The real document inventory remains 42 product documents/282 chunks and two retained synthetic uploads/two chunks.

The initial implementation measured 44,352 ms. The same query after bounded parallel reads and removal of duplicate checks measured 19,690 ms: authorize 639 ms, retrieve 11,979 ms, augment 0 ms, generation/validation skipped, release 7,042 ms. These are two development observations, not a controlled performance benchmark. Retrieval latency remains a release concern.

Live GPT-4o-mini comparison answers still require a reviewed multi-product receiver/context profile and its own approved allowance. The approved native General/RAG retest is separate and remains Research-owned. Uploaded documents retain their existing private ingestion and per-document search; automatic global uploaded-document model context is not connected by this checkpoint. Main-site rollout, native acceptance and broader answer-quality evaluation remain unverified here.
