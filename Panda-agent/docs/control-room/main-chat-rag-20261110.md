# Main Panda Agent grounded-chat release, 10 November 2026

The working RAG is connected to [Panda Agent on the primary domain](https://pandabyte-iot.vercel.app/panda-agent). Runtime source `94cf4ec56ddc665dd92971bdf377a5a1a26d9355` was deployed by Vercel CLI as `dpl_GxKywCmkQb1EPE3VJ2ettwAwb5G3` and promoted after the earlier combined build passed live checks. The final build passed another primary-domain grounded follow-up and browser recovery tests. The existing conversation-memory changes from `139fa22` and release documentation from `3c38af8` are preserved.

Product questions use fresh source-bound retrieval and GPT-6 Luna, with literal quotations and source links. Unknown models and unsupported specifications clarify or abstain. General conversation keeps its verified recent same-chat memory. Short factual follow-ups carry only the latest verified product identity, then retrieve current evidence again; previous answers never become evidence. Source, role, session and history changes still block dispatch/publication.

Hosted owner/Admin testing has **no cumulative application spending cap**. Production flags `PANDA_AGENT_MAIN_RAG_ENABLED=true` and `PANDA_AGENT_MAIN_CHAT_UNCAPPED=true` use the existing reviewed hosted profile. Migration `20261110150000_direct-unmetered.sql` passed rollback/ACL rehearsal and was applied. A live aggregate found three accepted uncapped general turns and zero budget links; the old local/native ledger was not reset or refunded. Existing provider receipt, token, privacy and ownership guards remain.

## Verification

- 234 affected tests passed, zero failures/skips; TypeScript, scoped ESLint and the Vercel production build passed.
- Both original 20-case retrieval regressions passed through the immutable snapshot and new main-chat preparer. These are retrieval regressions, not 20 fresh live model calls.
- Actual browser answers covered x8266 MCU/USB, Grove cable length and xC3 MCU, repeated questions, quoted citations, saved reload, no-evidence abstention and same-chat general recall.
- New-chat pronouns clarified. A verified x8266 question followed by “What is its USB connector?” generated “USB Type-C.” with the literal quotation “USB Type-C interface”.
- One earlier xC3 result was uncertain. Its claim/history was retained and logically cancelled through the corrected browser recovery action, without a provider retry. A distinct fresh xC3 question subsequently saved a cited answer. The exact rejected-output cause was not retained; the clarified prompt now explicitly places citations only in the evidence array, while all output guards stay enforced.
- A real saved answer's final SSE frame was deliberately dropped in the browser. The page restored it automatically with **one message POST and one exact-request GET**, without another model request.
- A controlled capabilities HTTP401 was followed by a fresh-token HTTP200 read. The page returned to Ready. All temporary network interception patterns were cleared.

## Timing and limits

The final primary-domain follow-up selected four passages/2,471 characters in **370 ms**, emitted context after **1,161 ms** of server handling, and delivered that context to the browser after **1,860 ms** from POST start. The complete saved model answer took **10,355 ms**. Four earlier primary-domain samples delivered context in 1,182–1,776 ms. These sequential samples meet the requested document-retrieval target; they are not a hard latency guarantee, and model inference/access checks/persistence add time to final answers.

Browser delivery timing uses cumulative decoded `Network.dataReceived` bytes to identify the chunk containing the complete context event; full decoded byte totals matched the SSE response. The deliberately intercepted lost-frame response is excluded from latency measurements.

Generation currently binds one product per turn; comparisons clarify. Implicit identity carry-over is limited to short factual references (240 characters/24 words), the latest verified evidence turn and the same owned chat. Long/ambiguous requests, a newer general/unknown/pending turn, or revoked evidence cannot inherit an older product. Full native/AWS/OpenCode orchestration remains a separate gate.

[Numeric release receipt](../verification/main-chat-rag-20261110.json).
