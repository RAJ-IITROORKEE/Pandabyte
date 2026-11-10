# Conversation Memory and Speed Implementation Plan

> For agentic workers: implement the scoped tasks below, with independent review before publication.

**Goal:** Make direct-chat follow-ups work from verified same-chat history and reduce measured orchestration overhead.
**Architecture:** v2 signed direct RPC adds history eligibility and context fingerprint while preserving v1. Bound the exact model request to the existing reservation; parallelize independent current checks.
**Tech Stack:** Existing Next.js/TypeScript, Clerk, InsForge PostgreSQL and OpenRouter Luna/Azure.
**Spec:** ../specs/2026-11-10-conversation-memory-speed-design.md

## Constraints

No RAG retrieval, external memory service, new dependency, provider retry, cap reset/refund or weakened ZDR. Preserve existing commerce and other-chat source. Root owns migration application, integration, release and handoff. Worker file ownership is explicit.

## Tasks

- [x] Memory worker: additive v2 RPC/readiness migration; bounded direct manifest and context hash; provider whole-pair byte fitting; direct store/service integration; tests for provenance, chronology, unicode, changed history, new chat/isolation, exact wire hash and budget limits.
- [x] Latency worker: overlap independent checks/read-only calls in owned policy/runtime/handler/connection files; controlled interleaving tests preserve revocation, cancellation and no duplicate POST. Coordinate provider/service changes with the memory worker.
- [x] Root: baseline passive browser timing; review/apply additive development migration with disposable fixture and cleanup; build/typecheck/lint plus focused tests; independent review.
- [ ] Root: local Codex Browser follow-up/reload/new-chat checks, compare request timing without repeating uncertain requests. Publish tested source to main and Vercel, verify real hosted follow-ups and reload, record remaining original allowance and handoff.

## Review focus

RAG/composite turns mislabeled as conversation; failed/cancelled/unverified history; cross-chat/owner leakage; stale context between admission and publication; UTF-8/JSON escaping invalidating cost bounds; latency caches weakening session or budget revocation.
