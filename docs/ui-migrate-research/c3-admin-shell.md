# C3 Admin shell implementation

Status: implementation complete; integrated browser/lint/type/build gates pending root verification.

Scope: `components/admin/admin-shell.tsx`, existing `components/admin/admin-shell.module.css`, new `components/admin/sidebar-layout.ts` and `components/admin/sidebar-layout.test.mjs`. The shell stylesheet already existed, so this task extends it rather than introducing a second shell stylesheet. No shared Admin workflow CSS, record screens, operations, roles, backend, package, configuration or design artifacts were edited by this task.

Source review: existing Admin shell, all `AdminShell`/`useAdminCapabilities` callers, guarded `app/admin/layout.tsx`, theme tokens, selected local Admin v7 reference and the C3 sidebar contract in `ui-migrate-plan.md`. Read Ponytail, UI/UX Pro Max, frontend accessibility skill and installed Next client-component/CSS-module documentation. Existing gaps were fixed rail width, static group headings and absent tablet compact behavior.

Behavior:

- Desktop 1024px+: 272px default rail; collapse and reset buttons; named vertical separator with 224–360px bounds. Left/Right resize 8px, Shift+Left/Right 32px; Home/End reach bounds; Enter resets width. Pointer capture updates width and ends on pointer release/cancel/lost capture, viewport exit and unmount. No width animation during dragging.
- Tablet 768–1023px: deterministic 80px icon rail, no drag or desktop width controls. All permitted links stay available even if their expanded group was previously closed. Stable link names and persistent labels beneath the icons provide navigation without hover dependence.
- Below 768px: original modal drawer trigger, focus trap, close/Escape/backdrop focus return, scroll lock and route-content focus remain in place. Desktop width/collapse controls do not appear.
- Expanded groups are disclosure buttons with `aria-expanded` and `aria-controls`. Existing active route, capability filtering, real links and capability context are retained. Theme icons remain the current ThemeToggle component with inherited theme tokens.
- Local storage key `pandabyte-admin-layout-v1` keeps only version, rounded/clamped width, boolean collapse and an allowlisted group list. Malformed/stale data or failed storage reads/writes fall back safely; no role/content/session state is persisted.

Verification actually run: `node --test components/admin/sidebar-layout.test.mjs` — 2 passed, 0 failed. Covers corrupt/null/stale values, width clamp and invalid numbers, unknown/duplicate group rejection, extra-field removal and exact mobile/tablet/desktop breakpoint rules. Node reported the existing package module-type warning; no package change was made.

Root browser checks still required: 320/768/1024/1440px in both themes; desktop collapse/expand/reset, keyboard bounds, pointer resize/cancel, reload persistence, malformed storage fallback; tablet focus labels and last navigation item; mobile focus cycle/Escape/backdrop/route transition and scroll restoration; capability-filtered navigation and current real Admin workflows. Root owns browser/server/global checks. Actual zoom, OS reduced-motion runtime switching and screen-reader speech were not tested by this worker. CSS preserves reduced-motion suppression.

No data mutation, service probes, owner-session changes, publication, commerce or deployment occurred. No commit was made by this worker; root owns integration and checkpoint commit.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
