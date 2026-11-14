# Free model pool research (OpenRouter) and OmniRoute assessment

Date: 2026-11-14. Method: OpenRouter public API (`/models`, `/models/{id}/endpoints`, `/endpoints/zdr`) plus live calls with the project key (key never printed or stored). Scripts: `C:\Users\rajra\AppData\Local\Temp\claude\5a9ca2e130e6144a\e0a459c7-32a0-49f5-acb6-0cbeb0fe89bd\scratchpad\models\`. No repo code changed.

## 1. Catalog result

14 `:free` models support `tools` with context >= 64k (of 14 free models with tools; all are reasoning-capable). Every one has exactly ONE endpoint (a single provider), so provider-level failover inside OpenRouter is impossible; failover must be across models.

**ZDR: none.** The `/endpoints/zdr` list (1105 entries) contains no free endpoint of any model. A request with `provider: { zdr: true, data_collection: 'deny' }` returns 404 "No endpoints found matching your data policy (Zero data retention)" for every free model that was tested, except Ling 3.2 Flash (see below). Paid siblings of some of these models (e.g. Gemma 4, Nemotron, Inkling 2 Small) do have ZDR endpoints, but those are not free.

Caveat on Ling: `inclusionai/ling-3.2-flash:free` (Ant Digital) answered 200 with `zdr:true, data_collection:'deny'`. It is not on the ZDR list, so this is most likely the flags being not enforced for that endpoint (its policy flag is unknown), not proof of ZDR. Treat it as NOT ZDR. Verify in the OpenRouter provider page before relying on it.

## 2. Free-tier rules (cited)

Source: https://openrouter.ai/docs/api-reference/limits.md and https://openrouter.ai/docs/faq.md

| Credits purchased (all time) | Requests/min | Requests/day |
| --- | --- | --- |
| < 10 | 20 | 50 |
| >= 10 (threshold is 1 credit below, i.e. ~9) | 20 | 1000 |

- Limits are per account (all `:free` models share one daily counter, UTC day), not per key or per model. Check live with `GET /api/v1/key` -> `free_model_daily_requests`.
- A negative credit balance can cause errors even on free models.
- Upstream providers add their own throttling: Gemma 4 31B and 26B (Google AI Studio) returned 429 "temporarily rate-limited upstream" on all three attempts today. The FAQ calls free models "not suitable for production use".
- Data policy: https://openrouter.ai/docs/faq.md and https://openrouter.ai/docs/guides/privacy/provider-logging.md. Providers that log or train are only routed to if the privacy-settings training toggle is on; there are separate toggles for paid and free models. ZDR means no storage after processing; "Safety Retention" and "Retention and Training" are the other tiers. Free endpoints are not ZDR (section 1), so free traffic may be retained or trained on per provider policy.
- `openrouter/free` router picks a random free model that fits the request (https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground.md); random choice is a poor fit for a deterministic pool, so prefer explicit ids.
- New gate: `thinkingmachines/inkling-2-small:free` returns 403 "only available on agentic harnesses" for API calls, so unusable here.

## 3. Test results (live, 2026-11-14, one run per model)

Tool test = `search_catalog` with sensible query. Code test = Arduino blink with setup/loop/pinMode/digitalWrite/delay present. No rate-limit headers were returned on any 200 response.

| Model id | Ctx | Served by | Tool call | Code ok | ZDR possible | Latency tool / code | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nvidia/nemotron-3-ultra-550b-a55b:free | 1M | Nvidia | yes `{"query":"ESP32"}` | yes | no (404) | 31.2 s / 34.7 s | Largest/most capable, but slow (cold or thinking time) |
| nvidia/nemotron-3.5-super-vl:free | 1M | Nvidia | yes "ESP32 board" | yes | no (404) | 0.6 s / 2.4 s | Fast; vision-language model |
| nvidia/nemotron-3.5-lightning:free | 1M | Nvidia | yes | yes | no (404) | 0.7 s / 8.2 s | Small/fast; max output 65k |
| cohere/north-mini-code:free | 256k | Cohere | yes | yes | no (404) | 0.8 s / 3.9 s | Coding-tuned mini; good Arduino fit |
| baidu/ernie-5.5-flash-preview:free | 1M | Baidu | yes | yes | no (404) | 1.0 s / 2.2 s | Preview; hosted in China, privacy concern |
| inclusionai/ling-3.2-flash:free | 1M | Ant Digital | yes | yes | flags accepted but not on ZDR list | 2.2 s / 13.7 s | Created 2026-11-13, brand new; fp8; China-hosted provider |
| google/gemma-4-31b-it:free | 262k | Google AI Studio | not tested (429 x3) | not tested | no ZDR endpoint listed for free | 0.4 s | Upstream rate-limited; stopped after repeated failures |
| google/gemma-4-26b-a4b-it:free | 262k | Google AI Studio | not tested (429 x3) | not tested | no ZDR endpoint listed for free | 0.4 s | Same as above |
| thinkingmachines/inkling-2-small:free | 1M | Thinking Machines | 403 harness-gated | 403 | n/a | n/a | Unusable via plain API |

Not tested (14 total): liquid/lfm-3-1.7b (1.7B, too weak), particle-ai/particle-1, recursive/flint-v1.0, dots-studio/dots-3-note-preview, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning (all unknown/small or very new, no ZDR). ~26 requests used.

Quality ranking caveat: I did not retrieve a reputable leaderboard; the ordering below uses parameter scale, vendor model cards/descriptions, and my own two-prompt smoke tests, so it is a judgement, not a benchmark. Run the RAG eval harness in the Admin control room before adopting.

## 4. Recommended free pool order (best first)

1. `nvidia/nemotron-3.5-super-vl:free` - fast, tools ok, 1M ctx, one provider (Nvidia).
2. `nvidia/nemotron-3-ultra-550b-a55b:free` - strongest by scale but 30+ s latency; use as quality fallback with a long timeout, or first if latency is acceptable.
3. `cohere/north-mini-code:free` - fast, coding-oriented, 256k.
4. `google/gemma-4-31b-it:free` - good quality/tools per model card, but currently upstream 429s; keep in pool only as a retry candidate.
5. `nvidia/nemotron-3.5-lightning:free` - fast, smaller.
6. `inclusionai/ling-3.2-flash:free` - works but brand-new; privacy of provider unclear.
7. `baidu/ernie-5.5-flash-preview:free` - works; China-hosted preview, least preferred for user prompts.

Failover logic notes: each id has one endpoint, so treat 429/5xx/403/404 as "next model". All share the account-wide 20 rpm and 50 (or 1000 with >= ~9 credits) per day budget; an agent loop of up to 10 steps burns 10 requests per user message, so the free pool is ~5 messages/day without purchased credits and ~100/day with them. Unlocking the 1000/day tier needs a one-time top-up (~$10), after which free calls still cost nothing.

Privacy caveat: no free endpoint is ZDR. Because the app currently requires ZDR for every model, a Free pool must be an explicit opt-in that bypasses the ZDR requirement, must say so in the UI, and should be restricted to non-sensitive prompts (public product questions) and probably excluded for users' private data or attachments. Also confirm the OpenRouter privacy settings toggle for free-model training/logging is on, or free routing will 404 for providers that log.

## 5. OmniRoute

What: self-hosted, MIT-licensed OpenAI-compatible gateway/aggregator in front of hundreds of providers (README claims ~375 providers, 150+ with free tiers, 1,400+ models; counts vary between sources). Quota-aware fallback, multiple routing strategies, dashboard, MCP/A2A. Maintained by GitHub user diegosouzapw, repo now at `cheaper-inference/OmniRoute` (old URL redirects); many forks and clones exist. Run via npm (`omniroute`), Docker or git clone; default port 20128.
Sources: https://github.com/diegosouzapw/OmniRoute , https://github.com/diegosouzapw/OmniRoute/blob/main/docs/reference/FREE_TIERS.md , https://pinggy.io/blog/omniroute_ai_gateway_security/ , https://andrew.ooo/posts/omniroute-free-ai-gateway-llm-providers-review/

Key facts:
- It is not itself a source of free inference. You supply accounts/keys for each upstream (Groq, Mistral, Cerebras, Gemini, OpenRouter free, Kilo, OpenCode Zen, Cloudflare, etc.) or use no-auth pools. Its own docs say usable capacity "can be lower, including zero on a fresh installation", and the headline free-token number (~1.62B/month) is aggregated from many separate third-party accounts with an admitted approximate methodology. A one-time $10 OpenRouter top-up appears in the same table.
- Needs self-hosting (a long-running Node/Docker process with a local data dir). It is not a serverless library and not a hosted service.
- Security/privacy: default admin password `CHANGEME` unless `INITIAL_PASSWORD` is set; exposing it publicly exposes every stored provider key; MCP scope enforcement is opt-in. OAuth/subscription-account routing (Claude Code, Copilot) has unclear ToS; its own docs flag some providers `tos: avoid`. All prompts still reach third-party free tiers with those providers' retention/training terms, so no ZDR improvement.
- Reliability (third-party test): of 7 no-auth providers only 2 responded; the A2A server is described as least mature. Project is very fast moving (version 3.8.50, daily changes, hundreds of contributors), a supply-chain and stability risk.
- Fit with Vercel: poor. Vercel functions cannot host the long-running gateway; it would need a separate VPS/container (extra cost, ops, auth hardening) and a public endpoint for the Vercel app to call, adding latency and a new attack surface carrying all upstream keys. For this app the same outcome (multi-model fallback) is achievable in ~20 lines inside the existing OpenRouter client by iterating a model list on 429/5xx.

Verdict: do not adopt OmniRoute for the production Panda Agent. If wanted as a later experiment, run it on a separate small host for dev only, never with user data. An in-app ordered fallback over `:free` models (plus optionally Groq/Cerebras/Gemini free keys behind the same interface) covers the need with far less risk.
