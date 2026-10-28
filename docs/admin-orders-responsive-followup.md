# Admin responsive/copy follow-up — 28 October 2026

Orders' implicit grid column inherited the table's intrinsic minimum width. The focusable table already had horizontal scrolling, but its parent grew before scrolling could contain it. An Orders-only root class now sets `min-width:0` and `grid-template-columns:minmax(0,1fr)`. No shared shell, public frontend, backend or data changes are needed.

Browser checks on the signed-in3030 preview:

| Viewport | Document width | Table viewport / content |
| --- | --- | --- |
| 320 | 305 | 275 / 1167 |
| 768 | 753 | 639 / 1204 |
| 1024 | 1009 | 719 / 1204 |
| 1440 | 1425 | 1120 / 1204 |

Both light and dark returned these containment measurements. Keyboard arrow input moved the focused table while document horizontal scroll stayed zero. Wide/mobile screenshots visually confirmed the table scrollbar and reflowing filters/pagination. Original viewport and System theme were restored.

The owner's subsequent Inventory comment changes missing-count wording to **Not set**, its action to **Set stock count**, and the form field to **On-hand quantity**. **Adjustment note** replaces Reason and explains that the note is saved in stock history. Required audit input, null unknown counts, source provenance and server validation remain intact; no stock was written. The dialog measured288px wide and562px high in a320×750 viewport, with no page overflow.

Targeted ESLint passed; Impeccable's mechanical detector returned no findings. No production build, backend test rerun or real-device touch check was needed/claimed. Screenshots are private under `.bootstrap/verification/admin-orders-responsive.png` and `admin-inventory-adjustment-note.png`.

The Orders and Inventory files also contain a separate ongoing checkpoint. Only the isolated two-line Orders containment patch is committed here; larger pre-existing changes and the coordinated Inventory copy stay in the shared working tree for that checkpoint.
