# Panda Agent memory integration contract

**Status: bounded existing-store project-context controls verified 9 November 2026; Mem0 configuration remains a disabled proposal.** No Mem0 runtime, package, provider, store, or customer-processing change is made by this document. This is not the separately supplied Mem0 plan: a scoped search of repository Markdown and 481 Markdown/MDX files in `C:\Users\rajra\Downloads` found no separate plan or configuration. The only matching plan references were in `Pandabyte_Master_Codex_Prompt.md`. No user credential files, provider probes, or broad personal-file search were used.

## Finding and recommendation

The owner's follow-up says to find the plan or configure Mem0 if required. This
authorizes preparing the needed configuration instead of waiting indefinitely for
a missing document. The following contract is a new proposal with that provenance,
not a reconstruction of the absent plan. Existing provider, storage, identity and
retention constraints still govern implementation. No hosted Mem0 service or new
customer-data processor is selected by this follow-up.

The prompt requires following a separate Mem0 plan but supplies no data flow, retention, provider, or deployment choice. **Do not enable Mem0 or send customer data to a new processor until those decisions and the exact implementation gates below are resolved.** Preserve the existing InsForge owner/thread project-intent memory and complete other independent work.

If a Mem0 implementation is later required, first evaluate the Mem0 open-source library behind the existing private application boundary. Prefer a genuinely local model/embedder and durable storage already approved for this deployment. Do not use Mem0 Platform or its hosted API under this proposal: that would add an external customer-data processor. The correct target runtime and durable store are unresolved; this proposal does not pretend that local library defaults fit Vercel or the current private FastAPI worker.

## Verified current state

- `Panda-agent/docs/lightweight-phase4-contract.md` specifies structured **project intent**, scoped to the authenticated owner and chat thread: bounded goal/board/revision/user-reported components, bounded unresolved questions, version and deterministic compaction. It explicitly forbids treating memory as source evidence and requires fresh approved evidence for factual runs.
- `Panda-agent/migrations/20261105090002_panda-agent-guides-skills.sql` defines `panda_agent_project_memory`, keyed by `thread_id` with `owner_subject`, a monotonic version, intent and bounded summary fields. RLS/direct grants are restricted; `panda_agent_project_read` checks the current authenticated owner; successful guide completion updates the memory under the existing serialized transaction.
- `Panda-agent/src/guide/contracts.ts`, `Panda-agent/src/server/guide-store.ts`, `Panda-agent/src/server/chat-store.ts`, and `Panda-agent/src/server/lightweight-handler.ts` validate/project this bounded state through the owned chat read and guide lifecycle. `Panda-agent/tests/guide-contract.test.mjs`, `guide-store.test.mjs`, and `guide-handler.test.mjs` cover validation, projection and lifecycle behavior. These tests are source evidence, not a new verification run in this task.
- The same migration makes project memory reference the chat with `ON DELETE CASCADE`; `app/api/panda-agent/chats/[id]/route.ts` exposes the existing owner-scoped chat-delete operation. The delete RPC rejects pending turns before deletion. This proves project-memory cleanup through chat deletion, not a complete cross-store Mem0 deletion contract.
- `Panda-agent/src/retrieval/context-summary.ts` reports bounded per-request retrieval counts; it is telemetry, not persistent conversational memory. No general cross-conversation customer-memory store or Mem0 adapter was identified in the inspected paths.
- The current lightweight service README describes a deterministic guide with no model call. The current Agent upgrade capability contract records that its worker model profile is empty. There is no established Mem0 integration or approved Mem0 provider/store configuration. The owner/thread intent review, correction and clearing controls below now exist in the existing store.
- `docker` and `ollama` were not found on the current PowerShell command path. This is a local environment observation, not proof those tools are absent from every runtime or deployment.

## Verified explicit project-context controls, 9 November 2026

The approved customer Memory & context view now allows add, review, correction and
clearing of bounded user-declared goal/board/revision/components. This uses the
existing InsForge owner/thread memory table and Clerk identity. It adds no Mem0,
LLM extraction, embeddings, new processor or cross-chat memory. Intent remains
user-reported context and cannot establish product facts or source authority.

GET/PATCH `/api/panda-agent/chats/[id]/memory` uses the current verified owner
session, private/no-store responses, same-origin writes and bounded strict JSON.
The additive migration `20261109155410_project-memory-controls.sql` is applied
only to the selected development Agent backend. Authenticated RPCs check ownership,
lock the active parent chat first and reject pending turns. Concurrent writes use
expected-version comparison, and an exact last-operation replay is idempotent.
Direct table access remains denied. Archived chats are readable but not editable.

Clear requires typed CLEAR. It empties intent, questions and recent goals while
retaining a versioned row, guide usage/compaction counters and chat messages. This
prevents a stale version-zero request from restoring an old memory or resetting a
budget. Existing owned chat deletion still cascades its project-memory row.
This does not promise erasure of unrelated message history, audits or backups.

Before a write, the UI persists and verifies an owner/thread recovery receipt
containing only operation ID and expected version. An unknown outcome blocks more
writes and never auto-retries. Status-only readback can resolve the matching
operation or a newer version; the same old version leaves the write uncertain.
Access/version rejection requires readback and review. A late response after
switching chats cannot update the next chat or clear the old receipt. Clearing
recovery storage failure retains a block. No customer text is stored in receipts.

The final built Codex Browser verified correction persistence, clear confirmation,
clear persistence, Cancel/success focus and 320px form geometry. Twenty-three
mounted HTTP checks used two real disposable development Clerk identities,
including cross-owner denial, concurrent conflict, replay, pending/archive guards
and cleanup. The pending guard used a synthetic SQL row, not agent dispatch.
All test identities and the separate disposable owner browser chat were cleaned.
Eight focused regressions pass within the 601-pass Agent/Admin suite (16 skips).
Counter preservation is source-reviewed; a nonzero-counter live case was not added.
Details and limitations are in `p1-implementation-verification.json.phase1ProjectMemoryControls`.

This closes a bounded existing-memory control gap. Mem0 activation, privacy/retention,
cross-surface native/Playground integration and source-withdrawal propagation remain
unverified. Phase 1 remains partial and Phase 2 gated.

## Versioned configuration proposal

This is a **documentation template only**, not a file to load or an installed configuration. Pin exact package/server versions and verify their transitive licenses before any adoption; Mem0's current Python project metadata reports version `2.2.1` and Apache-2.0, while the project has not selected that version.

```yaml
schemaVersion: 1
state: proposed_disabled
memoryProvider:
  implementation: mem0_oss
  package: mem0ai
  version: null                 # pin only after a reviewed compatibility/license audit
  license: Apache-2.0
  deployment: server_side_only  # exact existing runtime remains unresolved
  hostedPlatformApi: forbidden
processing:
  enabled: false
  llmProvider: null             # no new paid provider; local/previously authorized option must be verified
  embedderProvider: null
  outboundCustomerData: deny
  writePolicy: explicit_allowlist_only
identity:
  source: verified_clerk_session
  mem0UserId: server_derived_opaque_identifier
  acceptBrowserIdentityOrNamespace: false
scope:
  customer: disabled_until_reviewed
  adminPlayground: isolated_test_namespace_no_customer_memory
  development: separate_store_and_permissions
storage:
  vectorStore: unresolved
  historyStore: unresolved
  durablePrivatePersistenceRequired: true
retention:
  policy: owner_decision_required
  deletionAndBackupSemantics: verify_before_enable
sourceEvidence:
  storeRagFactsOrCitations: false
  requireCurrentApprovedRetrievalForFactualClaims: true
```

### Configuration rules when the disabled proposal is reviewed

1. Keep the exact config schema/version in an application-owned, versioned allowlist. The browser may request supported choices; it never supplies identity, storage paths, provider overrides, credentials, data scope, or executable configuration. Changes require current Admin authorization, expected-version checks, an audit entry and readback of effective state. Uncertain writes remain uncertain until readback; do not claim success or restart the runtime blindly.
2. The application derives Mem0's `user_id` from the authenticated Clerk subject on the server, preferably using a stable keyed pseudonym. Never use email, Clerk metadata, client input, or an OpenCode native session ID. Mem0's documentation demonstrates `user_id` add/search scoping, but the project's additional thread/project scoping must use a verified supported field/filter or a separately isolated store; do not assume an undocumented `thread_id` field provides isolation.
3. Admit only an explicit, reviewed allowlist of user-declared preferences or project intent. Do not ingest full chat transcripts, uploaded files, private tool payloads, agent hidden reasoning, credentials, development notes, Admin diagnostics, customer account details, or inferred sensitive traits by default. Keep the existing guide's explicitly unverified user intent in its existing owner/thread table until a migration is separately designed and approved.
4. Memory is personalization context, never evidence. Do not store product facts, RAG passages, citations, source grants, or source-derived answers in Mem0. Every factual answer reuses current approved retrieval and current citation/source checks. If a future reviewed feature stores source-derived material, it must preserve source IDs and versions, revalidate current source publication on every read, and invalidate withdrawn-source material and caches before it can affect a new answer.
5. Admin Playground memory uses a dedicated test namespace and disposable data. It cannot read, search, write, correct, or delete customer memory. Development task/document memory remains in its existing development-only systems and is never passed to customer or Admin runtime sessions.
6. Expose per-user review, correction, forget-one, forget-all, and privacy controls only after mapping each operation to verified Mem0 behavior. Deletion must cover Mem0's vector records, history store, any graph/secondary store, application caches/indexes, and configured backups/retention windows. A successful chat delete or a successful Mem0 API response alone is not proof that all copies are gone. Preserve unrelated order, account, audit, chat and source records according to their own contracts.
7. Memory has no tool execution, MCP calls, emails, payments, writes to CMS/orders/inventory, or other external side effects. Any later workflow that adds a consequential action must keep action authorization/confirmation in the existing execution and business-service boundaries; memory retrieval is not authorization.
8. Admin and operational output contains only redacted status and allowlisted metadata. Never expose raw memory records, provider keys, internal user identifiers, full prompts, private model reasoning or unfiltered audit payloads by default.

## Data-flow gate

The only acceptable future flow for an enabled version is:

`verified Clerk session → server-side owner/thread admission and consent/policy check → bounded allowlisted memory write/read in the selected private store → retrieved personalization context → existing approved RAG and citation validation for factual claims → existing protected chat/history finalization`

For Playground, substitute a dedicated Admin test identity/scope and a disposable store; there is no edge from that path to customer memory. Development memory is outside both product flows. Provider calls, embeddings, retention, deletion and backup copies must all be included in a reviewed data-flow diagram before activation. No raw customer prompt should be sent to a hosted LLM/embedder solely to create memories without a separately authorized and documented data-processing decision.

## Mem0 facts checked against official sources

Mem0 documents both an in-process OSS library and a self-hosted REST/dashboard stack. Its Python quickstart says the default `Memory()` uses OpenAI `gpt-5-mini` and `text-embedding-3-small`, with Qdrant at `/tmp/qdrant` and SQLite history at `~/.mem0/history.db`. Therefore “self-hosted” does not by itself mean local inference, durable production storage, or no external data flow. Its configuration docs list Ollama among supported Python LLM and embedder providers, but actual local model availability, resource fit and network behavior still require verification. The self-hosted server docs require Docker Compose and a configured LLM provider; the OSS overview describes Postgres/pgvector for that server. The Python package metadata reports Apache-2.0.

- [Mem0 Open Source overview](https://docs.mem0.ai/open-source/overview)
- [Mem0 Python quickstart and default components](https://docs.mem0.ai/open-source/python-quickstart)
- [Mem0 OSS configuration and providers](https://docs.mem0.ai/open-source/configuration)
- [Mem0 self-hosted setup](https://docs.mem0.ai/open-source/setup)
- [Mem0 Python package metadata](https://github.com/mem0ai/mem0/blob/main/pyproject.toml)
- [Mem0 repository license](https://github.com/mem0ai/mem0/blob/main/LICENSE)

## Exact unresolved dependencies before enabling anything

1. **Plan provenance:** no separate Mem0 plan was found. The owner subsequently authorized locating/configuring it as needed. Do not repeatedly request the absent document as the sole blocker; prepare a documented compatible configuration within the existing service and privacy limits. This authorization does not invent retention values, a local model service or approval for a new hosted extraction/embedding provider.
2. **Processing authority:** no separate decision defines allowed memory categories, explicit user notice/consent, extraction policy, retention duration, regional/data-processing terms, or whether customer text may be sent to any LLM/embedder. No Mem0 provider key was read or requested.
3. **Runtime and inference:** current integration uses Next.js plus a private lightweight FastAPI worker, whose documented guide path is deterministic. No compatible Mem0 runtime location or approved local model service is established. `ollama` was not found on the local PATH. Do not substitute Mem0's documented OpenAI defaults or another paid/hosted provider.
4. **Durable storage and isolation:** no selected durable Mem0 vector/history backend, application-to-Mem0 ownership mapping, thread-scope mechanism, RLS-equivalent enforcement, backup policy, or production storage lifecycle is verified. Mem0's local default paths are not evidence of persistent deployment storage.
5. **Privacy and delete guarantees:** exact OSS CRUD semantics, deletion propagation across all configured stores/backups, correction workflow, and retention/expiry behavior are not yet verified for a chosen version and store. Existing thread cascade deletion applies to the current InsForge project-memory row only.
6. **Operational acceptance:** no package/version has been installed or adopted, no integration or provider call has been made, and no real customer processing or deletion test is authorized by this draft. Before enablement, settle the missing decisions, review the versioned config, validate authorization/isolation and deletion with disposable identities, and update the single requirements authority with evidence.

Until these blockers close, retain the current owner/thread structured-intent memory and mark Mem0-specific integration pending rather than complete.
