# Basic RAG prototype implementation plan

9 November 2026. This records the owner's latest direction to deliver a practical
RAG chatbot before expanding the agent harness. It overrides OpenCode-first
ordering for this bounded prototype. The adopted master specification remains
verbatim, and its full scope remains tracked in the single requirements register.

**Goal:** an authenticated user asks about an approved PandaByte product in the
existing main chat, receives a concise grounded LLM answer with citations, and can
reopen the saved answer. Unsupported questions clarify or abstain.

**Architecture:** existing Next.js UI and Clerk session → existing authorized
InsForge lexical retrieval → bounded passages → one direct completion → literal
citation and current-source validation → existing signed chat history. No agent
loop, tool call, external search, customer-memory extraction or development memory
enters this prompt. OpenCode remains preserved for the following milestone.

**Stack:** current Next.js/React/TypeScript, Clerk and InsForge. Reuse the existing
retrieval/context/citation modules and installed MIT LangChain components. A small
HTTP completion adapter needs no additional SDK, MCP server or dependency. Keep
AnythingLLM as a structural reference rather than introducing a second platform.

**Authority:** latest user request plus the original specification, as modified
only by this dated priority override. This is localhost implementation and testing,
not deployment or permission to publish the current branch.

## Constraints and deliberate limits

- Zero cost and strict ZDR remain mandatory, including safety-retention exclusion.
  Current candidate is the exact free Xing4 model on Phala with no fallback.
- Keep live application inference off until exact current route/privacy checks and
  a successful bounded diagnostic with an actual zero-cost receipt pass.
- One small response with reasoning disabled only where the provider supports it.
  Do not assume a smaller prompt repairs an upstream429 or guarantees low latency.
- Existing approved UI remains. Substantive UI changes still need design review.
- Begin with one named product because current signed lightweight persistence
  binds one product. Do not claim arbitrary queries or broad RAG relevance.
- Preserve Clerk owner/session checks, source withdrawal fences, bounded inputs,
  private/no-store output, persistence and uncertain-write recovery.
- Preserve original and historical Phase6 work, other customer records, native
  discovery and the existing 97 requirements. Full P1 remains incomplete.

## Implementation sequence and exit checks

1. **Understand and simplify retrieval.** Extract reusable validated evidence
   preparation from `retrieval/answers.ts`; use it in `product-context-set.ts`
   without invoking a fake selector. Preserve fresh checks before external send
   and final release. Test changed/withdrawn sources, no selector invocation,
   canonical ordering/bounds and reduced remote-read counts. Measure real retrieval
   independently of provider latency before claiming a speed improvement.
2. **Bound one-shot generation.** Add a provider-independent basic RAG function
   over the existing context and evaluation contracts, with one injected guarded
   completion. Bound question/context/output, reject malformed or invented quotes,
   clarify/abstain without a call when evidence is absent, and revalidate current
   ownership/sources before send and final release. No agent loop or automatic
   retry. Provider-specific transport pins free model, exact provider, ZDR,
   data_collection deny, all zero price ceilings, no plugins/tools/fallback and
   verifies returned model/provider/finish/usage/cost. Tests use synthetic context
   and HTTP fixtures and must be labeled as such.
3. **Mount in current customer history safely.** Reuse signed lightweight
   begin/prepare/complete/cancel. Explicitly classify plain-RAG execution so read,
   cancel and unknown recovery never mistake its prepared turn for FastAPI or
   OpenCode. A callback swap alone is unsafe. Status-only recovery must never send
   another prompt. Do not revive older unfenced SQL finish functions. Verify
   duplicate requests, cancellation, owner isolation, restart/lost response and
   current-source checks with disposable development data before enabling.
4. **Verify the actual model and main UI.** Fresh route/privacy checks followed by
   one bounded synthetic diagnostic. If429 persists, retain inference off, record
   it and continue independent work. On success, test main chat and Playground
   using the same context/generation function, keep test/customer histories and
   memory isolated, and verify exact zero-cost receipt and grounded output.
5. **Accept the prototype before harness expansion.** Measure retrieval,
   generation and total response time on representative product questions. Check
   answer/abstention,429/unavailable, withdrawn source, reload, private history,
   cancellation and cross-user denial in API and Codex Browser. A fast target is
   an engineering goal until measured; do not report progress events as token
   streaming. Update handoff and requirement evidence. Only then resume harness,
   skills/MCP, web search, multi-product durable runs and expanded memory.

## Starting findings and acceptance status

The existing main-chat mode is a deterministic MCU quote selector using the
private FastAPI worker, not a general LLM RAG chatbot. The copied GPT-4o-mini
Playground generation path is intentionally disabled because it is paid. Native
application execution is also intentionally disabled. These are separate from
the provider's upstream Phala429. Retrieval currently repeats scope/catalog reads
through a dummy empty selector; removing that detour is independent of inference.

Prototype status starts **in progress, live acceptance blocked**. A passing build,
retrieval-only result or synthetic completion is not a successful live prototype.
Track evidence under `requirements.json.milestoneOverrides.basicRagPrototype` and
the existing P1 verification file, not a parallel task authority.

## References and tradeoffs

- Existing installed runtime notices: `docs/licenses/main-rag-runtime-dependencies.txt`.
- AnythingLLM's MIT core is a structural reference, not a reason to replace Clerk,
  InsForge or the reviewed ownership boundary:
  <https://github.com/Mintplex-Labs/anything-llm/blob/master/LICENSE>.
- OpenRouter exact provider/privacy/price routing:
  <https://openrouter.ai/docs/guides/routing/provider-selection>.
- Reasoning controls are provider-dependent:
  <https://openrouter.ai/docs/guides/best-practices/reasoning-tokens>.

## Current checkpoint evidence

Evidence preparation and guarded one-shot core/transport are implemented and tested.
Final suite:622PASS/16skips; production build and types/lint pass. The new modules
remain unwired to main-chat persistence. Actual provider diagnostic still429.
Browser retrieval returns the same2passages/638characters but measured9171ms
versus8826ms baseline; a speed improvement is unestablished. No prototype completion
or deployment is claimed. See the current handoff and existing P1 verification.
