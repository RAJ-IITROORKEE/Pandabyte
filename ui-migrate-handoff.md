# PandaByte UI migration handoff

## Active execution — 26 October 2026

The owner resumed implementation. Root is executing C1 before dependent UI page slices. All backend/data/commerce/publication/deployment holds remain. The original planning-only checkpoint below is historical.

- Existing `.agents/skills/frontend-a11y/SKILL.md` was found already installed by concurrent work; its Git blob exactly matches reviewed `a39419935900b1ac1003827d83c896610350b619`. Reused without overwrite. Existing `react-performance` and Impeccable copies are preserved.
- A normal root `lightswind@3.2.5` install failed `ERESOLVE`: concurrent 3D work added `three@0.186.1`, outside Lightswind's optional peer range. No override/downgrade was used. Root package/lock changes belong to that other work and are excluded from UI commits.
- Resolved the tooling boundary by installing the exact Lightswind tooling in isolated `.tools/lightswind/` with lifecycle scripts disabled. Install succeeded (8 packages added, isolated audit: 0 vulnerabilities). The app does not import this package or its plugin/global CSS. This is an explicit C1 plan adaptation to preserve concurrent dependencies.
- A medium Sol 6.1 worker adapted only Card/CardTitle/CardDescription from the pinned public MIT source. Root integrated the pilot through existing `EmptyState`, preserving section/H2/body semantics; only shared non-hero title scale changed. Source/license provenance: [adaptation note](docs/ui-migrate-research/lightswind-card-adaptation.md).
- C1 passed lint (two warnings in concurrent 3D tests, no errors), typecheck and production build. The Card pilot passed eight actual reflow/theme cases (320/768/1024/1440 × light/dark), preserving section/H2 semantics and no document overflow. Hero source hashes match HEAD; loaded desktop/mobile rendering and sensor selection/Home reset were checked. [C1 evidence](docs/verification/ui-migrate-c1.json). Root is committing this gate before dependent page dispatch. API/backend and CAD/3D viewer/gallery source changes are excluded from UI staging.

**Updated 26 October 2026 · plan-only checkpoint · baseline HEAD `8178ce0`.**

Read [ui-migrate-plan.md](ui-migrate-plan.md) before dispatching work. The latest human instruction requests the full plan **before actual migration/implementation**. This checkpoint creates documentation/research and a read-only browser baseline. It does not resume implementation automatically or authorize backend changes. “Admin panel backend” is scoped to administrative UI in this plan.

## Current status

| Checkpoint | Status | Evidence / next dependency |
| --- | --- | --- |
| C0: source/reference/library research | Passed | Three bounded Sol 6.1 xhigh reviewers; [frontend inventory](docs/ui-migrate-research/frontend-inventory.md), [library/skills review](docs/ui-migrate-research/library-skills.md), [validation contract](docs/ui-migrate-research/validation-contract.md). |
| C0: current reference retrieval | Passed | Authenticated official Superdesign CLI 0.14.0, six current drafts, versions/hash/local-match in [inventory](docs/ui-migrate-research/reference-inventory.json). Product anchor v9; protected Home v26. No generation/import/credit spending. |
| C0: built-in-browser baseline | Passed, bounded | [Actual observations/captures](docs/ui-migrate-research/browser-baseline.md): selected reference + existing localhost Home, Catalog, SKU search, PandaPulse, Contact, About and guarded Admin. This is not migration QA. |
| C0: final plan/handoff review | Passed, documentation scope | Sol 6.1 xhigh cross-review found no material blockers. Luna xhigh checked local links, reference versions/hashes, captures and whitespace; root corrected its capture-path/count wording finding. No runtime migration acceptance is implied. |
| C1: pinned library/skill adoption and shared primitives | **Passed** | Isolated tooling installed, existing skill verified, Card pilot integrated; lint/type/build and eight browser cases passed. [Evidence](docs/verification/ui-migrate-c1.json). Local commit is recorded below after creation. |
| C2: landing below hero, Contact/About, Catalog/PDP | **Not started** | Depends on C1 frozen shared contract. Three separate file-owner lanes. |
| C3: remaining public/account/auth/cart states + Admin shell | **Not started** | Depends on shared contract and available slots; preserve real states/guards. |
| C4: Admin workflows | **Not started** | Depends on frozen sidebar/shared Admin styles; one writer per shared file. |
| C5: integrated verification / local migration commit | **Not started** | No migrated app exists to verify/commit. No release or production-readiness claim. |

## Latest human constraints carried forward

- Primary visual anchor: [PandaPulse product v9](https://p.superdesign.dev/draft/e5d5055d-1779-4480-bc8f-f94e5c9e5897). Apply its theme/layout language to the actual current frontend and matching page references, not a second static site.
- **Keep the current entire homepage hero** and original panda logo. Match lower-page/shared UI with light/dark and 320/768/1024/1440 reflow. Preserve the real account/Agent controls and accessibility corrections.
- Priority: landing lower sections, Contact, About, product detail and Catalog; then remaining existing page families and Admin. Admin needs responsive layout, collapse/width resizing, useful groups/forms/tables and restrained feedback.
- No backend/API/schema/RLS/storage/auth/provider/security-policy/data changes. Another chat may continue backend work; preserve its files and all source/CAD/design artifacts. No importer rerun/backfill/publication, checkout/payment, real email/billing, recovery/load testing or deployment.
- Existing published records are authoritative. In the baseline, 42 source-observation products are non-purchasable; two missing-SKU items remain held. Keep source-price/capture caveats, no current-stock inference and actual empty About/Contact/FAQ states. No fabricated text/records to match prototypes.
- Use Ponytail, UI/UX Pro Max and relevant existing skills; selective Lightswind + ECC research is recorded below. This request does not install anything yet.

## Model / worker routing

| Task class | Configuration | Actual / next use |
| --- | --- | --- |
| Research, planning, QA/test design and deep review | `gpt-6.1-sol` / xhigh | Three research workers completed this checkpoint; final cross-review uses the same policy. |
| Medium implementation | `gpt-6.1-sol` / medium | Planned only; no implementation workers dispatched. |
| Light deterministic polish/document checks | `gpt-6-luna` / xhigh; Fast when supported | Use for final local link/state checks. This tool has no Fast/service-tier parameter; do not claim Fast was enabled. |
| Orchestration/integration/browser/shared files | Current chat GPT-6.1 Sol | Root owns the integration sequence, file contracts, package/lockfiles and single browser operator. |

At most root + three workers. Explicit file ownership is mandatory. Catalog/PDP share catalog CSS and ProductCard; Contact/About share editorial CSS; Admin modules share record/operations source and styles. Do not assign concurrent edits to those files. Root handles shared tokens/layout/header/footer and serial CSS/dependency integration. Do not split architecture or add abstractions just for parallelism.

## What changed in this planning checkpoint

| File(s) | Change |
| --- | --- |
| `ui-migrate-plan.md` | Full scoped plan: references, preservation rules, tokens, icons/motion, skills/library gates, page contracts, Admin interaction specification, worker routing, execution sequence and verification/rollback. |
| `ui-migrate-handoff.md` | This progress ledger, decisions, evidence and next checkpoint. |
| `docs/ui-migrate-research/frontend-inventory.md` | Current actual routes, callers, styling/shared-file ownership, data boundaries, Admin behavior. |
| `docs/ui-migrate-research/library-skills.md` | Primary-source Lightswind/ECC pins, terms, compatibility findings and future targeted install instructions. |
| `docs/ui-migrate-research/validation-contract.md` | Meaningful checks, no-write default, command classification, responsive/accessibility evidence and failure policy. |
| `docs/ui-migrate-research/reference-inventory.json` | Six read-only current Superdesign reference versions/hashes. |
| `docs/ui-migrate-research/browser-baseline.md` and `docs/ui-migrate-research/screenshots/` | Current-state observations and six locally saved captures: one Superdesign reference plus five localhost views. |

No net application component/style, package manifest/lockfile, backend/configuration or Superdesign artifact change was made by this plan checkpoint. The existing Next dev server was started only to inspect the current app on localhost. It temporarily regenerated the two `next-env.d.ts` imports to `.next/dev/types`; root restored those exact imports to their tracked `.next/types` baseline. No new app build/test suite was run merely for documentation.

## Dependencies / decisions and exact open gates

| Item | Current disposition |
| --- | --- |
| Lightswind | **Not installed.** Owner-selected library retained in the plan. Public repo pin `53ef2ee…` declares 3.2.2; published tooling candidate is pinned 3.2.5. Proposed later package-only install and local Card/Badge pilot; no blanket `init`, live registry auto-install, peer bypass, global theme reset or Pro setup. Runtime/dependency/a11y integration remains unverified. |
| ECC | **No new skill installed.** Reviewed current pin `25278e7…`; only `frontend-a11y` is proposed as a targeted documentation skill. Keep existing ECC backend copies/pins and untracked Impeccable intact. No collection/hooks/global config/executable reference tooling. |
| Icons/animation | Existing Lucide 1.61.0 retained; CSS transitions first. No new Motion/GSAP/Three/AI package justified. Hero motion remains protected. |
| Admin dragging | Planned as accessible docked-width resizing, collapse/reset and existing mobile drawer, not floating/reordered navigation or role persistence. Exact UI defaults are in the plan; implementation and tests pending. |
| Missing company/support/editorial data | Preserve explicit empty states. Owner factual/content approval and publication are separate; no mock fallback. |
| Contact attachments | Do not add a functioning upload when the current Contact API/form has no attachment contract. Record any future requirement as a separate backend dependency. |
| Development hydration warning | Observed existing script nonce attribute mismatch before migration; preserve evidence and CSP. No suppression/config/backend fix in this planning scope. Reproduction/root cause/production behavior remain open. |
| Accessibility manual gates | Actual zoom/text resizing, runtime reduced motion and real screen-reader speech remain unverified. Future viewport/DOM/source checks cannot close them. |

No answer is required to finish the plan. C1 installation/implementation remains pending a later execution instruction. If the library gate fails later, record the exact blocker and seek the smallest decision needed; do not silently abandon Lightswind or force incompatible dependencies.

## Evidence and checks actually performed

| Check | Result / limit |
| --- | --- |
| Initial Git status / source baseline | Read. Existing untracked design/Impeccable/CAD/source artifacts were present; not staged/deleted/moved. Baseline commit `8178ce0`. The generated Next type-import change was restored; final tracked-source diff is empty. New files are the planning/research deliverables only. No commit or staging performed. |
| CLI authentication / references | Passed: official CLI authenticated, six metadata/content hashes read, all match local design HTML. No Superdesign edit/generation. |
| Localhost | Initially unavailable; existing `npm run dev` started and reported ready. Subsequent anonymous localhost GET returned 200. This was not a provider/configuration probe or production benchmark. |
| Browser baseline | Completed bounded read-only navigation and exact-SKU search. Owner's existing identity/Admin dashboard remained available. No data mutation, contact submit, role action, purchase or logout. |
| Library / skill source research | Source/manifest/license/CLI review completed by Sol xhigh worker; no package or upstream executable install/run. Findings are not runtime compatibility passes. |
| Plan links / whitespace / cross-review | Passed: Sol xhigh document review, Luna direct link/hash/version/capture/whitespace checks, plus root final diff/scope review. `git diff --check` was clean; direct file checks also covered the untracked documents. One capture-path/count wording issue was corrected. |
| App lint/typecheck/build/unit/integration | Not run for this documentation checkpoint; no app code changed. Required later at the relevant UI gates. |
| Full responsive/theme/keyboard/zoom/motion/reader acceptance | Not run in this plan checkpoint. Future matrix and evidence methods are specified, not claimed complete. |

## Required update after each later checkpoint

Copy this compact record into the next entry; replace every placeholder with evidence or `not-run`/`blocked` and a reason. Do not mark a checkpoint complete from source inspection alone.

```text
Checkpoint / status / date:
Execution authorization and allowed operations:
Baseline and tested source commit / build mode:
Reference draft URL + version + hash:
Root / workers (actual model + effort + owned files):
Files changed; shared callers checked:
Visual changes and intentional data/auth/state differences:
Commands executed; exit/count/result and sanitized evidence path:
Browser route/state/role; requested AND observed viewport; theme:
Actions; expected/observed result; screenshot/evidence method:
Actual zoom / OS reduced-motion / speech gates (separate results):
Failures found → owned UI fix → bounded retest:
Data/publication/customer/role/config changes (required zero by default):
Owner session/access and preferences restored/retained:
Library/skill/license/dependency provenance delta:
Unresolved blockers/deviations and next dependent checkpoint:
Exact local commit if authorized; staged scope verified:
```

Default implementation verification is no-write. A disposable draft/upload fixture budget must be explicitly authorized and ownership/cleanup established before that check; do not invoke publishing, source integration or isolation harnesses by habit. Known required-check regressions block dependent work. Roll back only the owned UI diff, preserving other-chat work; no hard resets, backend restore or content republish.

## Next action when execution is resumed

Re-read current Git status and these two documents, inspect any concurrent backend/source changes, recheck current reference/library pins, and begin **C1 only**. Root first freezes shared presentation contracts and the protected-hero baseline, then installs/reviews the pinned tooling and one non-hero component pilot. Do not dispatch C2 page writers until that dependency gate is reviewable and passes. Update this ledger before moving to the next slice.
