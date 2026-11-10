# Sub-phase A review

Date: 2026-11-10. Scope: the exact A allowlist and contract in design_draft.md. Later phases are not implementation-ready until their own exact plan/review.

Two fresh-context Goldfish reviewers read the installed Codebase Details / Implementation Readiness personas, the implementation-readiness standard, the draft and named existing source/test callers. They checked the tagged 2.2.5 message/form schemas and native question/todo behavior. Both were read-only and made no provider/runtime calls.

Initial reviews found three Major ambiguities: exact private projection fields and metadata omissions; native Form.Detail versus state-less Info and answer-state rules; and tool/compaction/activity/timestamp decision handling, including busy times after native restart. No Blocker was reported. Root froze the explicit A result shapes, state matrix, metadata allowlists, per-state input rules, question binding/state/reply signatures and bounds, and added the shared pure research-values.ts validator to the allowlist.

Both reviewers reread the repairs and reported all three original Majors resolved, with no remaining Blocker/Major in A's scoped readiness/source/security review. This is targeted readiness, not implementation acceptance or formal five-stage EGM convergence.

The owner explicitly authorized technical planning followed by stepwise implementation and tests. Root now leaves the EGM design-only workflow for A implementation under that instruction. Source review and verification results follow before the A commit and before B starts.

Baseline before A: 66 tests passed, zero failures, four existing opt-in local 2.2.6 execution tests skipped. These skips are not proof of 2.2.5 native runtime readiness. AWS 2.2.5 version probes are separately recorded; synthetic native execution and live research remain future gates.

Two new fresh-context source reviewers then inspected the actual A implementation and fixtures. They found five Majors: stale idle settling a newer busy period; tool ran escaping assistant lifetime; field type/null coercion; inherited array serialization hooks; and native absent-versus-closed string option semantics. Root added failing regressions, reproduced the defects and repaired them. Additional fixtures cover literal enum arrays, native producer-shaped questions, exact 4000-byte/multibyte reply limits and invalid trusted bindings. Both source reviewers reread their repairs and reported all five findings resolved with no remaining Blocker/Major in their scopes. These reviews did not run tests; root verification is recorded separately.

Root verification passed: 133 tests, zero failures, four existing opt-in local-native skips; typecheck and scoped lint passed. The default production Turbopack build passed after giving the isolated worktree physical dependencies from the unchanged lockfile. Earlier junction and alternate-Webpack failures are retained in phase-a-verification.json; no unrelated CSS or dependency versions were changed. A's protocol gate is closed; it does not prove native research execution, Tavily or hosted acceptance.

A verification follow-up: root found that the application tsconfig does not include unconnected modules. Direct strict TypeScript checking therefore became an explicit A check. It exposed type-narrowing issues; the validator branch now uses equivalent if/else and chronology checks snapshot validated clock values into local constants. Direct strict tsc passes, 133 regression tests pass with four unchanged skips, and scoped lint passes. The original source reviewer reread this two-file diff and found no Blocker/Major or behavior/security regression. The earlier app/build checks alone did not establish strict checking of these unconnected modules.
