# Categories table and product charts — 27 October 2026

The owner authorized the Categories Mono table/editor follow-up and shadcn-style product chart visualizations, with Luna xhigh workers and built-in-browser validation. Public storefront code, layout, theme and data are unchanged.

## Categories

The isolated `/admin/categories` table uses a private `catalog.edit`-gated `/api/admin/categories/table` endpoint and the additive development RPC `admin_list_categories`. It supports bounded title/slug search, status filtering, seven stable server-side sorts, 10/20/50 rows and offsets through 10,000. Rows include serials, title/slug, parent label, active product count, status, concise updated date and edit/archive actions. Existing generic category list APIs and all other module tables remain compatible.

Create/edit reuses the existing versioned category editor with generated/manual slugs, category-specific organization copy and Sonner status. New category titles generate slugs until manually overridden; existing slugs stay unchanged. Table and editor archival always require a themed confirmation. Archival retains history, requires `catalog.edit` plus `content.publish`, checks the current version and preserves existing child/product dependency guards. The interface does not force-unlink products or children or permanently delete records. Archival is the existing safe delete operation; no existing category is archived during testing.

Migration `20261026213552_admin-category-table.sql` adds only the read-only function and explicit grants. No record or public query change. Rollback callers first, then revoke the unused function through a new forward migration. Parent selection retains the existing first-100-category bound; larger hierarchies will require a separately scoped searchable picker.

## Product charts

Admin-scoped `ChartContainer`/`ChartTooltipContent` adapt the required parts of official [shadcn chart composition](https://ui.shadcn.com/docs/components/base/chart) and its [MIT source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/chart.tsx). Existing Recharts 3.10.1 remains installed; no registry-wide install, dependency or global theme changes. Attribution is in `docs/licenses/shadcn-chart.txt`.

KPIs show real total/category/priced/unpriced counts. Category bars show actual membership counts with complete accessible data; the price chart compares current minimum/average/maximum and repeats exact INR values. No revenue, growth percentages, historical trend, sales record or stock is fabricated from the reference screenshot. Categories may overlap, and prices use the existing once-per-product calculation. Static bars preserve reduced-motion behavior. Chart SVGs have no hidden focus stops; exact text remains accessible. Missing and empty values have honest states.

## Verification

Root integrates and verifies browser/API/data behavior using unpublished disposable category records and temporary fixture-only capabilities. No owner session switch or role change, real category/product edit, media mutation, publication, importer rerun, checkout/payment, email/billing, recovery operation, load test or deployment. Test records, users and grants are cleaned up after browser checks. Original source/CAD/Superdesign artifacts are preserved. Final results, screenshots and local commit are recorded in [evidence](verification/admin-categories-charts.json), `docs/phase-progress.md` and `ui-migrate-handoff.md`.
