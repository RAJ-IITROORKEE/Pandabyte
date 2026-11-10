# Conversation memory and direct-chat speed

Scope authorized 10 November 2026: same-chat follow-ups and faster direct LLM replies, a live update and handoff. Keep RAG, external memory services and AWS/OpenCode separate; strict ZDR and the original cumulative USD1 cap stay unchanged.

Reuse signed direct-turn records. Add a v2 RPC around unchanged v1 operations, returning begin-time eligibility for six preceding completed direct turns plus a context fingerprint. Require owner/thread, terminal non-cancelled direct journal, receipt and answer hashes; intersect IDs with the existing masked ChatRead. State returns a fingerprint to reject changed history before dispatch and publication. Separate v2 readiness avoids disabling the v1 live route when applying the migration.

Send fixed system, chronological complete user/assistant pairs, current question once. Drop whole oldest pairs until the final serialized body fits 7,000 UTF-8 bytes. Keep existing 8,024 input/700 output limits, exact-body claim hash and one 1,597,640-nanoUSD reservation. New chat is empty; reload uses verified server records. This is a bounded recent context window, not cross-chat or unlimited memory.

Alternatives: complete history can exceed the reservation bound; external summaries add calls, cost and privacy scope. The bounded verified window fits the requested same-chat behavior with the existing stack. Six turns is an engineering default.

Speed: overlap independent live checks/read-only RPCs, while keeping fresh endpoint/ZDR/safety checks, current session/budget, atomic one-claim/no-retry dispatch, cancellation and receipt-before-publication. No completed privacy/session cache across requests. Compare hosted browser message-POST timing, with small-sample limitations.

Implementation and checks: see ../plans/2026-11-10-conversation-memory-speed.md. Root owns migration application, integration, publication and handoff; workers have explicit disjoint ownership. No substantive UI redesign is planned.
