# Paid model research for Panda Agent (14 Nov 2026)

Scope: cheaper or better-value PAID OpenRouter models that keep the zero-data-retention (ZDR) rule, tested in the real agent loop. No repo code changed. Scripts and raw per-question results (full answers) are in the session scratchpad `models\paid\` (`test.mjs`, `results\*.json`, `answers.txt`). Spend about $0.06 of OpenRouter credit (cap $0.50).

## 1. Method
- Candidates come from `GET /api/v1/endpoints/zdr` (1105 ZDR endpoints) joined with `/api/v1/models`. Filter: paid, `tools` supported, context >= 128k, input <= $0.40/M and output <= $1.60/M (plus a few better models near Haiku's price). Gemini excluded. Each model's cheapest ZDR endpoint is listed; `tool_choice` and `reasoning` support come from that endpoint's `supported_parameters` / `supports_tool_choice`.
- Test harness: `pin-replay.mjs` adapted to the real loop (`agent-loop/loop.ts`, `tools.ts`, skills, real ESPXS3 passages). The request body is the production provider block (`only:[tag]`, `allow_fallbacks:false`, `require_parameters:true`, `zdr:true`, `data_collection:'deny'`) with `tools`, `tool_choice:'auto'`, `include_reasoning:false` and a per-model reasoning setting. Cost = OpenRouter `usage.cost`. The production `max_price` guard was not sent (it is derived per profile); add it when a profile is made.
- Not done: no leaderboard was fetched live (no verified source reachable here), so "quality" is judged from the three answers plus the OpenRouter model-card text, not from published benchmarks. Treat the ranking as a small-sample signal (3 questions, 1 run each, some provider flakiness).

## 2. Candidate table (cheapest ZDR endpoint)
| Model id | ZDR provider tag | $/M in | $/M out | Context | Max out | tool_choice | reasoning | Notes |
|---|---|---|---|---|---|---|---|---|
| anthropic/claude-haiku-5.5 (baseline) | google-vertex/global | 0.10 | 0.50 | 1.0M | 128k | yes | yes (disable ok) | current default |
| deepseek/deepseek-v4.1-flash-1017 | sail-research/fp4/us | 0.073 | 0.108 | 1.05M | 384k | yes | yes (disable ok) | 42 ZDR endpoints exist; fp4 |
| z-ai/glm-5.3-flash | relace/fp4 | 0.040 | 0.078 | 1.05M | 131k | yes | mandatory (use low effort) | fp4 |
| qwen/qwen3.6-35b-a3b | primeintellect/fp8 | 0.011 | 0.101 | 262k | 65k | yes | yes (disable ok) | 3B active params |
| openai/gpt-oss-120b | primeintellect/fp4 | 0.035 | 0.075 | 131k | 65k | yes | mandatory (low effort) | 23 ZDR endpoints |
| minimax/minimax-m3.1-flash | inferact-vllm/nvfp4 | 0.075 | 0.30 | 1.05M | 131k | yes | mandatory (low effort) | upstream 429 rate limits during test |
| z-ai/glm-5.3 | wafer/us | 0.070 | 1.40 | 1.05M | 943k | yes | mandatory (low effort) | big model, output price high |
| mistralai/mistral-small-2603 | mistral/zdr | 0.15 | 0.60 | 262k | 209k | yes | yes (disable ok) | first-party Mistral ZDR |
| deepseek/deepseek-v4-flash (same model as current Flash) | deepinfra/fp8 | 0.09 | 0.18 | 1.05M | 393k | yes | yes (disable ok) | current profile uses wafer/mxfp4 at 0.12/0.17 |

Other ZDR-eligible tool models under the caps that were not tested: inclusionai/ling-3.1-flash (novita, 0.045/0.135), deepseek/deepseek-v4.1-flash (deepinfra/fp8/flex 0.112/0.336), xiaomi/mimo-v2.6-flash (cohere/fp8 0.14/0.28), thinkingmachines/inkling-2-small (primeintellect/fp4 0.15/0.50), google/gemma-4-31b-it (coreweave/fp4 0.10/0.34), nvidia/nemotron-3.5-super-vl (io-net/nvfp4 0.09/0.30), tencent/hy3 (0.083/0.33), qwen/qwen3.5-35b-a3b (parasail/fp8 0.15/1.00), openai/gpt-5-nano (azure 0.05/0.40, 400k). No clearly better model sits near Haiku's price; the tier above (kimi-k2.6 0.57/2.40, deepseek-v4-pro 0.90/1.50, glm-5.2 0.45/1.44) was not tested.

## 3. Test results (Q1 PSRAM, Q2 pinout/I2C/UART, Q3 air-quality build)
Format: result kind / steps / tool errors / citations / in+out tokens / seconds.
| Model (tag) | Q1 | Q2 | Q3 | 3-Q cost | Quality judgment |
|---|---|---|---|---|---|
| Haiku 5.5 baseline (google-vertex/global) | final/3/0/3/14.4k+0.7k/7s | final/3/0/8/18.6k+1.5k/10s | final/5/1/8/67.9k+9.8k/48s | $0.0161 | Careful, hedges correctly (flags N16R8 variant; I2C pins stated as an assumption), cited, code present. Best calibration. |
| deepseek-v4.1-flash-1017 (sail-research/fp4/us), 2 runs | run1 final/3/0/3/9.8k+0.8k/21s; run2 final/4/0/8/14.6k+1.8k/16s | run1 stopped (provider `step:unavailable`); run2 final/4/0/8/21k+2.8k/19s | run1 final/4/0/8/29.8k+3.0k/66s; run2 final/4/2/8/22.3k+2.9k/41s | $0.0036 (both runs) | Correct facts, full pinout table, correct UART0/UART1 mapping, good BOM plus code. One transient provider error in 6 calls; slower on Q3. |
| glm-5.3-flash (relace/fp4, low effort) | final/3/0/3/9.0k+0.3k/33s | final/4/0/7/19.2k+1.6k/20s | final/7/1/8/49.8k+2.1k/26s | $0.0029 | Correct, cited, code present; Q3 header-pin description slightly muddled. Q1 33 s was a cold start. |
| qwen3.6-35b-a3b (primeintellect/fp8) | final/3/0/2/9.8k+0.2k/10s | final/3/0/3/12.7k+0.9k/16s | ask/1/0/0/2.7k+0.2k/2s | $0.0004 | Q2 wrong in detail (puts TX/RX on the left row, garbled layout); Q3 asked a clarifying question instead of building. Cheapest, weakest. |
| gpt-oss-120b (primeintellect/fp4, low effort) | final/4/0/0/11.5k+0.3k/5s | final/4/0/0/17.5k+2.0k/16s | stopped/7/1/0/44k+1.8k/53s | $0.0031 | Returns a raw JSON envelope (`sourced/citations/general`) with EMPTY citations; incompatible with the loop's output contract. Q3 `unknown_sku` then step error. |
| minimax-m3.1-flash (inferact-vllm/nvfp4, low effort) | final/4/0/2/13.8k+0.3k/5s | stopped (`step:unavailable`) | 429 upstream | $0.0007 | Not evaluable: rate-limited; a second full attempt returned 429 on all 3. |
| glm-5.3 (wafer/us, low effort) | final/3/0/1/9.0k+0.2k/4s | final/4/0/8/19.1k+1.8k/17s | final/4/1/8/28.8k+2.4k/30s | $0.0102 | Strong and fast; good table, correct caveats. Near Haiku quality at ~0.63x cost, but output-priced ($1.40/M). |
| mistral-small-2603 (mistral/zdr) | final/4/0/1/13.5k+0.1k/5s | final/5/1/3/23.2k+2.1k/16s | final/7/0/8/49.4k+3.4k/35s | $0.0076 | Correct facts, concrete wiring table (shared I2C on GPIO8/9); one wiring "pin 17" label looks off. Only ~2x cheaper than Haiku. |
| deepseek-v4-flash (deepinfra/fp8) | final/4/0/3/14.2k+0.5k/9s | final/5/1/4/23.8k+2.4k/17s | final/4/2/8/33k+3.5k/38s | $0.0049 | Good, quotes sources. Same model as the current Flash profile at about half the cost. |
| deepseek-v4-flash (wafer/mxfp4, current profile) | final/4/0/1/14.4k+0.4k/6s | final/5/1/8/23.8k+2.1k/19s | stopped/10/1/0/90k+3.8k/47s (trimmed x2, uncited_sourced) | $0.0095 | Q3 hit the step limit; weaker than deepinfra fp8 on the same prompt. |

Total OpenRouter spend: about $0.059 (includes retries and the failed minimax/gpt-oss runs).

Cost per 3-question run relative to Haiku ($0.0161): v4.1-flash-1017 about 0.12-0.23x, glm-5.3-flash 0.18x, gpt-oss-120b 0.19x, qwen3.6-35b 0.03x, glm-5.3 0.63x, mistral-small 0.47x, deepseek-v4-flash deepinfra 0.30x, wafer 0.59x. Haiku's Q3 was the most expensive because it wrote 9.8k output tokens (the longest, most complete answer).

## 4. Ranking by value (quality per dollar, small sample)
1. deepseek/deepseek-v4.1-flash-1017 on sail-research/fp4/us: correct, cited, code, roughly 5-8x cheaper than Haiku. Risks: fp4, an unfamiliar provider (one transient `unavailable`), up to 66 s on the long answer.
2. z-ai/glm-5.3-flash on relace/fp4 (low effort): correct and cited, about 5x cheaper; reasoning cannot be disabled so latency varies; unfamiliar provider.
3. deepseek/deepseek-v4-flash on deepinfra/fp8 (same model as today's Flash): about half the cost of the wafer profile and it completed Q3 where wafer did not.
4. z-ai/glm-5.3 on wafer/us (low effort): closest to Haiku quality at 0.63x cost; best "better value, not cheapest" option.
5. mistralai/mistral-small-2603 (mistral/zdr): good and first-party ZDR, but only about 2x cheaper.
6. Rejected: gpt-oss-120b (no citations, JSON envelope), qwen3.6-35b-a3b (wrong pinout details, asked instead of answering), minimax-m3.1-flash (rate-limited, untestable now).

## 5. Recommendation and caveats
- Add: `deepseek/deepseek-v4.1-flash-1017` (tag `sail-research/fp4/us`, reasoning `{enabled:false}`) as the cheap, good option. Consider `z-ai/glm-5.3` (`wafer/us`, reasoning `{effort:'low',exclude:true}`) as the near-Haiku alternative, and optionally `z-ai/glm-5.3-flash` (`relace/fp4`, low effort).
- Keep: Haiku 5.5 as default and quality reference (best calibration, most robust across all three questions including the long Q3).
- Replace/adjust: switch the DeepSeek V4 Flash profile from `wafer/mxfp4` to `deepinfra/fp8` (same model, cheaper, finished all three) or replace it with v4.1-flash-1017. Qwen 3.8 27B ($0.15 / $1.875 per M) is the most replaceable current paid model: its output price is 3.75x Haiku's and nothing tested showed it beating the cheaper picks (it was not itself re-tested here). GPT-OSS 20B is already blocked from the loop.
- Caveats: (1) 3 questions x 1 run; not statistically meaningful. (2) `sail-research/fp4/us`, `relace/fp4`, `primeintellect/*`, `inferact-vllm/nvfp4` are small endpoints: their ZDR status comes from OpenRouter's list and must be reviewed against each provider's terms like the existing profiles; uptime varied (minimax 429s, one stopped answer on deepseek-1017). (3) fp4/fp8 quantization can hurt long-context tool use. (4) Mandatory-reasoning models need `{effort:'low',exclude:true}` and have variable latency. (5) A real profile also needs the endpoint's exact pricing/param lists and `maxPrice`; `max_price` was not exercised. (6) Gemini was excluded. (7) Another agent wrote to the same scratchpad `models\` folder during the run, so the final scripts and results are in `models\paid\`.
