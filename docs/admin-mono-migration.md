# Admin Mono migration

The owner approved implementation on 26 October 2026 after the read-only review. This replaces the previous Superdesign/Lightswind appearance for Admin only. Public storefront styling, logo, hero, data and provider configuration remain outside this migration.

## Visual authority

- [Kiranism dashboard](https://shadcn-dashboard.kiranism.dev/dashboard/overview), reviewed in Brave in Mono light/dark; overview, collapsed navigation, command menu, product/user tables, product form, all four form examples, workspaces, chat, AI chat, notifications, icons and profile were inspected.
- [Pinned source](https://github.com/Kiranism/next-shadcn-dashboard-starter/tree/9084ffd954d24591d9b1d279c4b18e119b02b34e): shadcn Base UI `base-nova`, Geist Mono, Tabler icons, monochrome surfaces, squared controls, compact typography and Recharts panels.
- The signed-in reference redirected its auth route; sign-in composition was reviewed from source. Template sample records, revenue, sales, notifications, billing, organizations and live AI are not PandaByte facts or services.

## Implementation boundaries

- Existing `app/admin/layout.tsx` retains the server access gate. Shared document layout, provider, storefront theme and public CSS stay intact.
- Admin uses its own scoped tokens, `data-admin-theme`, appearance preference and Geist Mono. Portal-rendered account controls receive explicit appearance values.
- `/admin-login` is an isolated Clerk presentation. The public SiteFrame excludes only this additional Admin entry route; existing public routes keep their shell. There is one Clerk provider and no login bypass.
- Existing list/editor/role/media/inquiry/pricing/inventory data flows and security rules remain authoritative. UI navigation filtering never replaces API authorization.
- Overview charts show accessible current record counts. No inferred trends, revenue or sales history.
- Workspaces, Chat and AI Chat are clearly marked Coming soon, with empty prototype layouts and no new service calls.

## Components and licensing

Exact new runtime packages: `@tabler/icons-react` 3.49.0 and `recharts` 3.10.1, named imports within Admin. The existing public Lucide usage remains. Native/shared controls preserve application behavior while their composition and styling follow the reviewed blocks; this is not a wholesale starter replacement or a claim that all 71 upstream UI files were imported.

Geist Mono is self-hosted through Next's font loader, scoped to Admin. Notices are retained in `docs/licenses/tabler-icons-react.txt`, `recharts.txt`, `geist-font.txt`, and `kiranism-dashboard.txt`. No Pro assets, extra identity provider, Clerk Billing, Sentry service or demo API is introduced.

## Verification checkpoint

Delivered 27 October 2026. The built-in browser records 104 accepted layout/theme cases across 13 page families at measured 320/768/1024/1440 widths. Search, sidebar controls, local appearance, Clerk portal presentation and no-write editor validation were checked. Dark borders and primary actions use contrast-safe neutral values rather than reproducing low-contrast vendor grays. Chart data has an accessible table; the visual SVG does not add a hidden keyboard stop.

Evidence and the local commit are recorded in `docs/verification/admin-mono.json` and `docs/phase-progress.md`. Full interactive signed-out sign-in, actual zoom/text resizing, runtime OS reduced-motion switching and screen-reader speech remain untested. No backend/service/data/publication or deployment work is implied.
