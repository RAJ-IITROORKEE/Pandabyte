# C2 citation selection compatibility

Status: revised 11 November 2026 to resolve the prior readiness Major (splitter conventions) and add projected tool-history wire-budget coverage. A fresh scoped Goldfish readiness recheck (Claude Opus 5.5 general-purpose reviewer reading the EGM implementation-readiness/codebase-details personas and standard) found no Blocker or Major; it ran the splitter pseudocode over 20,000 random/crafted inputs without violation. Its eight Minor/Nit findings are incorporated below. Ready for bounded implementation. The owner has already authorized stepwise implementation. This changes the research evidence data format, not OpenCode execution ownership or the live RAG path.

## Observed failure

The 512 MiB real fixture (`5cb28b63…`, SSM `68c3f90d…`) completed three verified Groq responses and two Tavily searches with zero OOM kills. Its final answer used a correct compact source alias, but the model rewrote a 240-character quotation: it exceeded the 200-character limit and was not a literal substring (ASCII hyphen changed to a non-breaking hyphen, list formatting rewritten). The host withheld the answer. A fresh semantic review found the official datasheet excerpt supported the interface list in substance; that does not establish that future selections will support every claim.

Do not weaken literal evidence validation or silently repair that answer. The model selects a supplied passage ID instead of generating quotation text. The host renders the exact already-delivered source passage. Answer text must still match the paid/native stop byte for byte and receives semantic review.

## Exact data contract

Canonical Tavily receipts keep their existing full source handle, URL, title, full content and capture time. The compact alias remains `S` plus the first 16 hex characters of SHA-256(canonical handle), with existing collision/coalescing guards.

The model-facing MCP text becomes exactly `JSON.stringify({kind:'tavily_excerpt',sources})` where each source is exactly `{handle,url,title,passages,capturedAt}` in that key order; handle is the compact alias and passages is an ordered array of objects exactly `{id,text}` (key order `id`, `text`).

### Normative splitter (single implementation)

`researchPassages(content)` in `research-search-broker.ts` is the only splitter. All indices are UTF-16 code-unit offsets; ranges are half-open `[start,end)`.

- Break characters: exactly code units 9, 10, 11, 12, 13 and 32 (ASCII TAB, LF, VT, FF, CR, SPACE). NBSP (U+00A0), BOM (U+FEFF) and every other Unicode space are NOT break characters.
- `MAX = 180`, `LOOKBACK = 60`, `MIN = 120`.

```
start = 0; fragments = []
while start < content.length:
  if content.length - start <= MAX:            // final fragment: never shortened
    end = content.length
  else:
    end = start + MAX
    if 0xD800 <= code(end-1) <= 0xDBFF: end = end - 1   // never split a surrogate pair
    low = max(start + MIN - 1, end - LOOKBACK)          // inclusive lower bound
    for j from end-1 down to low (inclusive):
      if code(j) in BREAK: end = j + 1; break           // break char stays in this fragment
  fragments.push(content.slice(start, end)); start = end
```

Consequences, each covered by tests:

- `fragments.join('') === content` exactly; nothing is trimmed, added or normalized.
- Every fragment is nonempty and at most 180 units. Every non-final fragment has length ≥ 120 (because `end ≥ start+179` and `low ≥ start+119`), so a ≤ 6000-unit source yields at most 51 fragments; the hard bound remains 64. Note: without a surrogate step `end = start+180` and `low = end-60 = start+120`, so the lowest usable break index is `start+120` (fragment length 121); `start+MIN-1` only binds after the surrogate decrement (`end = start+179`, `low = start+119`, length 120). Edge tests must use these actual values.
- A fragment never begins with a lone low surrogate or ends with a lone high surrogate; every fragment is `isWellFormed()` because the receipt content is.
- IDs are `P1`…`Pn` in order.

### Selectability

A passage is selectable as evidence only if `text.trim() !== ''` (ECMAScript `trim`) and it satisfies the existing public-quote predicate `publicAnswerText(text,200)` (no `\p{Cf}`, no C0/C1 controls except TAB and LF). Non-selectable passages stay in the projection and reconstruction; selecting one makes the final answer invalid. Known limitation: a passage containing CR, a soft hyphen or another format character cannot be cited as a whole; this is recorded in evaluation, not repaired by normalization. Measured before implementation on the six real `5cb28b63…` sources: 41 passages, 41 selectable, 0 containing CR, 0 containing `\p{Cf}`.

### Validation layers (who checks what)

- **Broker / host (authoritative for split points):** `researchSearchMCP(receipt)` (renamed export of the current `mcpFor`) builds the projection with `researchPassages`. `verifiedSettlement` recomputes the projection and compares `hashResearchJSON` of the stored MCP; `verifyResearchAnswer` recomputes it and compares `resultHash = hashResearchJSON({receipt,mcp})`. Any divergent split, ID, order or text fails those hash comparisons. `verifyResearchSearchFixtureAnswer` (C1 synthetic) compares no hash; it must resolve the selected passage from `researchPassages(source.content)` itself. There is exactly one splitter implementation on the host.
- **Old-format records fail closed:** settlements and catalog `resultHash` values stored in the previous `{content}` projection no longer match the recomputed passage projection, so a cached old-format settlement returns 503 without a new search and an old-format catalog entry is invalid. This is intended (prior fixtures are retained, never replayed). A broker test asserts the cached old-format 503 with zero search calls.
- **MCP size after search:** the passage format adds about 2 KB per receipt against the 24,000-byte MCP text bound. 16,000 bytes of ordinary prose projects to about 18.9 KB (fits). Quote- or newline-heavy content that already exceeded the bound still does, and fails closed with 503 after the Tavily search was spent (unchanged behavior, slightly earlier threshold). A broker test asserts a 16,000-byte prose receipt projects to ≤ 24,000 bytes.
- **Shim (structural, does not re-split):** exact source keys; each passage exactly `{id,text}`; IDs exactly `P1..Pn` consecutive with `1 ≤ n ≤ 64`; each text a nonempty well-formed string of at most 180 units; reconstructed content (`join('')`) nonblank, ≤ 6000 units, aggregate ≤ 16000 UTF-8 bytes; alias equals `S`+16 hex of SHA-256(`web:${sha(url)}:${sha(content)}:${sha(content)}`) over the reconstruction; `item.text === JSON.stringify({kind:'tavily_excerpt',sources})`. It returns the broker payload byte-for-byte. Deliberately not enforcing the split rule in the shim avoids a second implementation whose divergence could only cause false rejections; the host hash check is the binding guarantee.
- Existing 24,000-byte MCP text, 32,768-byte broker response and 16,000-byte aggregate content limits remain unchanged.

### Final envelope

Final output is strict JSON exactly `{answer,evidence:[{handle,passage}]}`. `passage` matches `^P(?:[1-9]|[1-5][0-9]|6[0-4])$` and must exist in that alias's projection; at most two selections; duplicate `(handle,passage)` pairs rejected. Free-text `quote`, URLs, citation markers, extra keys and unknown or foreign IDs are rejected. Empty evidence still requires the existing exact insufficient envelope. Unsupported/private/board inferences remain forbidden by instruction and semantic review.

- `verifyResearchAnswer` (C2): unchanged answer rules (≤ 1200 chars, `publicAnswerText`, marker/URL regex, exact paid stop text). Resolve quote = selected passage text; require selectability. Citations keep canonical handle/URL/title/captureTime and that exact quote. Private `usedSources` entries become exactly `{operationKey,resultHash,sourceHandle,passageID,quote}`.
- `verifyResearchSearchFixtureAnswer` (C1 synthetic): exactly one `{handle,passage}`; answer must equal the selected passage text; passage nonblank. It deliberately does not apply the C2 selectability predicate, so a C1 pass is not a selectability proof.

Implementation status (11 November 2026): implemented by two bounded Claude Opus 5.5 workers plus root driver changes; 111 focused tests, native strict checking, scoped lint, task validation and diff checks pass. A fresh Claude Sonnet 5.5 (medium) Goldfish source review differential-tested the splitter against this pseudocode on 30,000 random inputs (0 mismatches) and found no Blocker/Major; its one Minor is the C1 asymmetry noted above. Native B/C1/C2 host regressions and a new real question remain.

The complete projected MCP remains covered by resultHash and matched against the actual native completed tool. Source currentness, alias collisions, earliest verified native transcript order and final release checks remain unchanged. No model repair request, fallback, trimming or replay is added.

## Projected tool-history wire budget

The provider wire limit (canonical request ≤ 14,000 UTF-8 bytes, in policyHash) is unchanged. Measured on the six real sources from `5cb28b63…` (two searches), the passage format adds 1,218 escaped bytes (+15%) to tool-result history (8,255 → 9,473). That run's third call consumed 2,801 input tokens; a representative two-search continuation therefore remains viable with roughly 1.5–2.5 KB margin, and a third full search is expected to exceed the bound and fail closed as `not_sent` before any POST. That is acceptable: no trimming, summarization or retry.

Tests added to `Panda-agent/tests/research-openrouter.test.mjs`, building tool messages from the real exported `researchSearchMCP` projection (not hand-written JSON):

Message shapes (from `validResearchProviderBody`): tool messages exactly `{role:'tool',tool_call_id,content}`; assistant tool-call messages `{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'panda_research_search',arguments}}]}`.

1. Representative viable case: system message ≤ 1,000 bytes + short user message + two assistant tool-call messages + two tool results, each tool result one receipt of three sources of exactly 1,200 ASCII prose characters (spaces every few words) → `prepare` succeeds; assert the measured POST body is ≤ 14,000 bytes, its sha256 equals `prepared.wireRequestHash`, and exactly one POST occurs.
2. Boundary: run one baseline `prepare`+`complete`, measure the POST body length, then pad the system content with ASCII by the exact difference (one byte per character) to reach 14,000 bytes → `prepare` succeeds and the POST body is exactly 14,000 bytes (sha256 matches `wireRequestHash`); pad one more character (14,001) → rejects `not_sent` with zero fetches of any kind (the size check precedes metadata requests; only the non-network `dispatchCurrent()` runs first) and no trimming.
3. Over-limit from tool history alone: three tool results, each one receipt of three sources of about 5,333 ASCII characters (≤ 16,000 bytes per receipt, within the 6,000-character per-source limit) → `not_sent`, zero fetches, the native body is not mutated.

## Ownership and checks

- **Source worker:** `Panda-agent/src/server/research-search-broker.ts`, `Panda-agent/tests/research-search-broker.test.mjs`, and the new wire tests in `Panda-agent/tests/research-openrouter.test.mjs` (which import the broker export). Export `researchPassages` and `researchSearchMCP`. Tests: exact concatenation; break at positions `end-1` and `low` (both inclusive edges) and at `low-1` (not used); no break → 180 or 179 (surrogate); surrogate pair at 179/180; final fragment of exactly 180 and 181 remaining; leading/trailing/blank fragments; NBSP/BOM not breaks; CR is a break; 6000-unit sources; ID resolution, duplicates, unknown/foreign IDs, free-text `quote` rejection, non-selectable passage rejection, changed result hashes, alias coalescing, `usedSources.passageID`.
- **Native worker:** `Panda-agent/runtime/opencode/research-mcp-shim.mjs`, `Panda-agent/runtime/opencode/research-profile.mjs`, `Panda-agent/tests/research-binding-plugin.test.mjs` (and `research-runtime.test.mjs` only if an expectation requires it). Structural validation above. Shim test fixtures build passages by hand (no import from the broker, so the two workers stay independent); bad cases include `P0`, an ID gap, a 181-unit text, 65 passages, extra passage keys, an empty text, and an alias that does not match the joined text. In `research-profile.mjs` the hosted instruction sentences from "Final output must be strict JSON" through "each with a literal source quote of 1 to 200 characters." are replaced verbatim by: `Final output must be strict JSON exactly {"answer":"...","evidence":[{"handle":"...","passage":"P1"}]}. The answer must contain at most 1200 characters. Include at most 2 evidence selections; each selects one supplied passage ID exactly as given for that source handle. Never write quotation text; the host renders the selected passage.` All other instruction text, tools, permissions, steps, limits and engine settings are unchanged. The profile hash changes by design.
- **Root:** `Panda-agent/scripts/test-native-research.mjs` synthetic responses (C1 fixture answer = `passages[0].text` with `{handle,passage:'P1'}`; C2 injected answer selects `P1`; changed-quote forgery becomes a foreign-passage forgery), `phase-c2-*` docs/verification and this plan. Source bundle stays at 24 files and the immutable native code list at six; no new source file.

Run red/green focused tests, native strict checking, lint and the bare-Node bundle guard. Fresh source review precedes the actual injected model/search, C1 native search and B native regressions. No real call before those gates pass. Then run a distinct public documentation question and the unsupported-board turn, semantic answer/passage review, metadata-only LangSmith correlation, broad regression and cleanup health. Full web harness/browser/main release remains D through G.
