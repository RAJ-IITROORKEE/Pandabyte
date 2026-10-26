# C4 Admin workflow presentation

26 October 2026. Existing workflow forms, tables, real counts and state handling are retained. Root reviewed `admin-ui.module.css`, the record/operations callers and the existing Roles table pattern. No workflow, API, provider, capability or data contract changed.

Built-in-browser testing found document-level horizontal overflow in the 320px product listing: an absolute visually hidden table heading used a containing block outside the horizontal scroller. Adding `position: relative` to the existing `.tableFrame` anchors that text inside its intended frame. Eight listing viewport/theme retests now have equal document scroll/client widths. The wider table remains intentionally scrollable.

Record lists, pricing/inventory, inquiries and media wrappers reuse the Roles pattern: a meaningful region name, `tabIndex={0}` and a shared visible focus outline. Actual ArrowRight input moved the product scroller 40/74px while the page stayed contained. CSS cannot supply those semantics, so root made only the four wrapper attribute changes in the two shared workflow files, preserving their concurrent 3D/media edits and staging UI-only versions against HEAD.

The new Admin shell passed keyboard/pointer width, reload persistence, collapse/expand/reset, groups, mobile drawer/focus/Escape/scroll and route-focus checks. Invalid new-product fields stopped locally before API saving and focused the summary; private preview opened without saving. Media-row Enter selected existing media and focused its detail heading. Protected owner presentation remained intact. No draft, upload, price, inventory, inquiry, membership or publication write was performed.

See [final evidence](../verification/ui-migrate-final.json) and [handoff](../../ui-migrate-handoff.md). Actual zoom, OS reduced-motion switching, cross-browser scrolling and screen-reader speech remain manual gates; source/viewport checks do not substitute for them.
