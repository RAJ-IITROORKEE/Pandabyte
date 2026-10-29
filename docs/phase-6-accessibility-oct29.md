# Phase 6 accessibility retry — 29 October 2026

Continued after `8bc4215` with two bounded Luna xhigh reviewers, built-in-browser checks and a local commit. The working tree includes unrelated account/Admin/checkout work; this checkpoint commits only its filter/gallery fixes, focused tests and documentation. No data, cart contents, permissions, publication, payment/provider configuration, dependencies or source/CAD/design artifacts are changed.

## Findings and fixes

- A mobile Filters drawer correctly returned focus on ordinary Escape, but crossing to desktop closed it after its mobile opener became hidden, leaving focus on `body`. The existing breakpoint handler now focuses the visible Filters heading after closing. The heading has a visible outline and remains outside sequential tab order; the next Tab reaches the category controls. Resizing an already closed drawer does not steal focus.
- Enlarged product photos could change with arrow buttons/keys while focus stayed on the control, without announcing the new photo position. The existing count is now an atomic polite status, “Photo N of M.” Arrow navigation still wraps among photos, avoids the separate 3D slide and restores focus to the image opener on Escape.
- The proposed account navigation overflow was not present at measured 320 CSS pixels: its open mobile disclosure uses a stacked grid and all section links remain reachable. No speculative account/sidebar cleanup was performed.

## Verification and limits

Both regressions failed before the fixes and all five focused tests now pass (`tests/catalog-filter-focus.test.mjs` and `tests/product-gallery-tabs.test.mjs`). Targeted ESLint and `tsc --noEmit` pass. Luna review of the final five-file code/test diff found no blocking issue. No full production build or broad mutation/integration suite was repeated against the unrelated dirty worktree.

The built-in browser was reconnected after clearing stale bindings. Measurements use actual `innerWidth`, not merely requested viewport size: the current 1.2 device-pixel ratio meant a requested 384px viewport yielded 320 CSS pixels. Account disclosure/grid and keyboard entry passed with no page overflow at that measured width. Shop Filters opening, ordinary Escape return, and the repaired 320 → 1024 CSS-pixel breakpoint focus passed. The gallery's Next/ArrowLeft sequence produced “Photo 2 of 2” then “Photo 1 of 2”; Escape restored focus to “Enlarge image 1 of 2.” These are DOM/keyboard results, not spoken-output evidence.

### Manual gates remain distinct

- **Reduced motion:** the owner chose to test this personally. The observed preference was `false`; no setting was changed and no runtime reduction pass is claimed. The earlier bounded source review found no definite defect in hero/circuit, product-card carousel, 3D auto-rotation or brand-marquee fallbacks.
- **Actual zoom/text resizing:** Ctrl+0 had no measurable effect. Available browser capabilities expose viewport sizing, not native zoom or text-size control. Genuine 200% text/zoom and 400% reflow remain unverified; the viewport checks above do not replace them.
- **Screen reader:** the owner accepted a guided Narrator/NVDA check. Instructions were provided for image enlargement, hearing “Photo 2 of 2,” Escape and focus return. Until a human reports the spoken result, this remains pending; an AX tree or live-region attribute alone is not reader coverage. Broader navigation/form/error speech also remains open.

Existing account/session and cart state are preserved. Keep payments, content publication, load tests, deployment, live email/billing and backup/export/restore deferred. Full Phase 6 accessibility and production exit are not met. [Evidence](verification/phase-6-accessibility-oct29.json).
