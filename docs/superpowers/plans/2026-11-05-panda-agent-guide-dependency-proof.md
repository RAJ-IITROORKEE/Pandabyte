# Panda Agent Guide Dependency Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Preserve the already selected Sol review/Terra implementation method and Root integration ownership.

**Goal:** Prove the license, compatibility and resource footprint of one Python guide coordinator before adopting it in the Phase 4 runtime.

**Architecture:** Keep the accepted TypeScript evidence/auth/history boundary and private FastAPI service. Review a pinned LangGraph candidate in an isolated build; do not put the graph runtime in the browser or change the serving Phase 3 container during the proof.

**Tech Stack:** CPython 3.12, pinned ARM64 Docker base, FastAPI, LangGraph candidate `1.2.20`, existing Next.js/Clerk/InsForge integration.

**Spec:** [Phase 4 contract](../../../Panda-agent/docs/lightweight-phase4-contract.md), the user's eight-phase brief and the [current handoff](../../../Panda-agent/docs/lightweight-harness-handoff.md).

## Global Constraints

- Preserve Phase 3 checkpoint `198ee4de8d8700487c9c3168ba2e7fa3b9644891` and the current 1-CPU/512-MiB private container. No production cutover, public listener, provider enablement, paid fallback or root JavaScript dependency change.
- One coordinator only. OpenCode is an interface reference; its server/CLI/TUI, indexing, shell and workspace machinery stay outside the replacement image.
- Python owns guide coordination; TypeScript owns current evidence policy. No database/session/operator credential or developer skill enters the worker.
- Retain license notices. Metadata saying MIT is not a review of all transitive wheel contents or hosted-service terms.
- Owner authorizes automatic phase continuation; this preflight is not a new permission gate or an acceptance claim for guides/skills.

## Review Focus

- Windows resolver environment markers can differ from Linux; verify the actual ARM64 installation before locking a closure.
- The candidate adds LangSmith and another HTTP stack transitively; importing the graph must make no telemetry or model request.
- `orjson` currently declares an MPL component; inspect its shipped license/notice files and obligations rather than describe the whole closure as MIT.
- Concurrent guide tasks must share one deadline and budget; a library's recursion setting alone does not bound external calls or cancellation cleanup.
- A dependency proof cannot reopen Phase 3 turns, change canonical source rights or claim a hardware/compile result.

### Task 1: Record candidate feasibility and immutable inputs

**Files:** Read `Panda-agent/services/lightweight/{Dockerfile,requirements.txt}`; record `Panda-agent/docs/verification/lightweight-phase4-dependency-preflight-20261105.json`. Raw reports remain in ignored `Panda-agent/infra/lightweight/artifacts/`.

**Interfaces:** Consume existing exact runtime pins and public PyPI wheel metadata. Produce candidate package/version/hash/license declarations; do not produce a runtime lockfile yet.

- [x] Check the current official [LangGraph package](https://pypi.org/project/langgraph/1.2.20/) and [workflow documentation](https://docs.langchain.com/oss/python/langgraph/workflows-agents). Treat documentation examples as references, never authority to add tracing or a model provider.
- [x] Run the actual isolated PyPI-only command: `node_modules/.panda-db-venv/Scripts/python.exe -m pip --isolated --disable-pip-version-check install --dry-run --ignore-installed --only-binary=:all: --platform manylinux2014_aarch64 --python-version 3.12 --implementation cp --abi cp312 --index-url https://pypi.org/simple --cache-dir node_modules/.panda-python-review-cache --report Panda-agent/infra/lightweight/artifacts/phase4-langgraph-resolution.json -r Panda-agent/services/lightweight/requirements.txt langgraph==1.2.20`.
- [x] Verify exit 0, all 17 existing pins unchanged, 44 resolved packages/27 additions. Record wheel hashes and declared licenses without installing packages or editing the runtime manifest.
- [ ] Inspect every candidate wheel's actual license/notice files and bundled components; record the exact chosen license alternative and required notices. Reject an unresolved declaration or incompatible obligation before adoption.
- [ ] Check current published security advisories for the exact proposed pins and verify the downloaded wheel hashes against the official index. Record findings; do not resolve them through an automatic dependency update.

### Task 2: Measure an isolated Linux coordinator build

**Files:** Root-owned ignored candidate build directory and measurement receipts; update the same dependency review after measurement. Serving files and runtime requirements remain unchanged until the gate passes.

**Interfaces:** Consume Task 1's reviewed hash-pinned wheel closure and the existing pinned base image. Produce an ARM64 image fingerprint, installed dependency inventory, size delta and measured resource receipt, without serving customer traffic.

- [ ] Build with exact hashes and the existing non-root/read-only/capability/resource restrictions on the approved host after verifying headroom. Preserve the existing gateway, serving container, journal and key.
- [ ] Run network-isolated constructor tests for `StateGraph` start/join/end, two independent read-only tasks, six transitions maximum and one shared 30-second deadline. Assert zero model calls, no SDK telemetry, cancellation cleanup and no recursive delegation.
- [ ] Compare baseline/candidate image bytes, cold startup, idle/peak memory, CPU, restart/OOM counts and one bounded warm run under 1 CPU/512 MiB. Report measurements rather than call the dependency lightweight from its wheel size.
- [ ] Review the complete Linux installed inventory and notices against Task 1; stop/remove only the named disposable proof container. Keep the accepted serving image active.

### Task 3: Close the dependency gate and settle implementation contracts

**Files:** `Panda-agent/docs/lightweight-phase4-contract.md`, `Panda-agent/docs/lightweight-harness-handoff.md`, and a subsequent guide/registry implementation plan.

**Interfaces:** Consume the measured candidate decision and the existing source/ADMIN inventories. Produce exact guide wire/schema/UI ownership before application implementation.

- [ ] Sol reviews the license/resource receipt. Select LangGraph only if the measured requirement passes; choose the brief's alternative only with a concrete reason, never add both coordinators.
- [ ] Settle the explicit guide opt-in body, private action/audience and result union, per-run/current-skill/source/version fences, 8,000-character public text limit, project-memory fields/limits/compaction threshold and cancellation/status semantics.
- [ ] Specify Root-owned forward migrations for immutable bundled skill versions, ADMIN review/release history, owner-project activation and bounded intent. Reuse actual ADMIN membership and optimistic version guards; do not treat existing role catalogs as a skill registry.
- [ ] Record exact file ownership and first adversarial tests in the guide/registry plan, then implement the authorized features. Keep ordinary MCU queries on the current path and do not mark Phase 4 PASS from this preflight.

Self-review: this plan covers the dependency preflight only. The full guide, compaction, Admin skill lifecycle and actual browser acceptance remain required by the Phase 4 contract; none is represented as implemented here.
