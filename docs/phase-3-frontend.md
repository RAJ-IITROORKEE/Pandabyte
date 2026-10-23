# Phase 3 admin frontend

24 October 2026. This note records the implemented admin interface, selected Superdesign references and observed browser journeys. The final [verification record](verification/phase-3.json) records the tested development checkpoint and the production/next-phase gates that remain held.

## Selected admin design references

The current local metadata in `.superdesign/screens.json` and `docs/verification/design-reference.json` identifies these ten admin drafts and versions:

| Screen | Route | Selected draft | Version |
| --- | --- | --- | ---: |
| Admin dashboard | `/admin` | [e9fb785b-89be-46d3-9ce8-62c31fb08caa](https://p.superdesign.dev/draft/e9fb785b-89be-46d3-9ce8-62c31fb08caa) | 7 |
| Admin catalog | `/admin/products` | [6e06af84-879f-4222-9638-838daedc2350](https://p.superdesign.dev/draft/6e06af84-879f-4222-9638-838daedc2350) | 9 |
| Admin operations | `/admin/orders` | [e2ad89c7-03ec-404c-81b6-b0e78f676572](https://p.superdesign.dev/draft/e2ad89c7-03ec-404c-81b6-b0e78f676572) | 9 |
| Admin content | `/admin/content` | [5e8c9517-2973-47a1-9401-1aa082d4fc91](https://p.superdesign.dev/draft/5e8c9517-2973-47a1-9401-1aa082d4fc91) | 9 |
| Admin Clerk login | `/admin/login` | [521d3292-d31b-47b2-9d6a-d02a2d95752f](https://p.superdesign.dev/draft/521d3292-d31b-47b2-9d6a-d02a2d95752f) | 6 |
| Admin categories | `/admin/categories` | [72821a4c-645d-4932-aad6-fd2de2783aec](https://p.superdesign.dev/draft/72821a4c-645d-4932-aad6-fd2de2783aec) | 6 |
| Admin enquiries | `/admin/enquiries` | [6bbb23d9-3272-4200-ac17-3d4a261a3ae4](https://p.superdesign.dev/draft/6bbb23d9-3272-4200-ac17-3d4a261a3ae4) | 6 |
| Admin FAQs | `/admin/faqs` | [1079b038-c4e6-4781-bef0-3aa72d784c02](https://p.superdesign.dev/draft/1079b038-c4e6-4781-bef0-3aa72d784c02) | 6 |
| Admin users and permissions | `/admin/users` | [a34f1ad1-cfc1-4075-984c-3b5d9af6e1f8](https://p.superdesign.dev/draft/a34f1ad1-cfc1-4075-984c-3b5d9af6e1f8) | 6 |
| Admin navigation | `/admin/navigation` | [ec86da91-b2fa-4283-95ae-6bf379dc79d0](https://p.superdesign.dev/draft/ec86da91-b2fa-4283-95ae-6bf379dc79d0) | 6 |

The Admin operations draft is a visual reference. The live `/admin/orders` route states that orders, refunds, and fulfillment are planned for Phase 5; it has no queue or invented order counts. There is no separate settings route: contact details and navigation are edited in their corresponding content modules. `/admin/enquiries` is the historical design route; the implemented module is `/admin/inquiries`.

## Access and screen behavior

The `/admin` layout requires an active Clerk session and at least one current staff capability. It reads grants through the server authorization helper. Unauthenticated requests return through Clerk sign-in to `/admin`; users without a staff grant receive an access-denied state. The sidebar only displays links for granted capabilities, and each screen checks its own capability as well.

| Screen or module | Read access | Write and action access |
| --- | --- | --- |
| Dashboard | Counts from bounded admin list endpoints for modules available to the current capabilities | No content mutation; totals are actual `total` values, with request failures shown as unavailable |
| Products and categories | `catalog.edit` | Create/edit drafts and catalog relationships with `catalog.edit`; publish, unpublish, and archive also require `content.publish`; restore a revision as a draft requires `catalog.edit` |
| Blog, pages, FAQs, team, contact, navigation, solutions, Learn resources, and videos | `content.edit` | Create/edit structured drafts with `content.edit`; publish, unpublish, and archive also require `content.publish`; restore a revision as a draft requires `content.edit` |
| Pricing | `catalog.edit`; prices are listed separately from product prose | Versioned INR price changes with a reason require `catalog.edit` |
| Inventory | `orders.manage`; exact stock fields are limited to this capability | Versioned, reasoned, idempotent adjustments require `orders.manage` |
| Media | `media.manage` | Upload, edit metadata, and archive require `media.manage`; publishing or withdrawing public media also requires `content.publish` |
| Inquiries | `inquiries.manage` | View details and notes; update status and add internal notes with `inquiries.manage`. Notifications are shown as unconfigured; the UI does not claim email delivery. |
| Users and roles | `staff.manage` | The page shows the current account’s grants. It does not grant or edit staff capabilities; those writes remain restricted to verified project operators. |
| Orders | `orders.manage` link visibility | Unavailable until Phase 5; no order, refund, or fulfillment workflow is represented as operational. |

The dashboard uses live list totals for products, categories, blog posts, pages, FAQs, media, and inquiries, filtered by the caller’s grants. It does not display placeholder metrics. Inventory is presented on its own screen, and no order queue appears in Phase 3.

Record lists use bounded search and pagination, show draft/published/archived status, and open per-record editors. Edits use the record version; stale saves surface a conflict and allow the user to reload the server version. The editor keeps a local unsaved-state warning, supports an in-editor draft preview, and saves dirty content before an explicit lifecycle action. Published records provide a separate **Publish updates** action as well as **Unpublish**. Restore copies a prior published revision into a new draft; it does not publish automatically.

Rich content uses a structured block editor for headings, paragraphs, ordered and bullet lists, links, published media images, code, and tables. It does not expose raw JSON or executable HTML. Each block has an ordered legend and contextual control labels; repeated row inputs include their row and field in the accessible name. Media and relation pickers show selectable records only and respect the corresponding bounded API limits.

## Browser evidence

Root observed the following journeys in the built-in browser on localhost: create a blog draft, save it, reload it, preview the private draft, publish it, render the public record, and then unpublish it and confirm the public route returns 404. The record editor was checked at 320, 768, 1024, and 1440 pixel widths in both themes without horizontal overflow. On mobile, opening the navigation and pressing Escape closed it and returned focus to its trigger.

The rebuilt production bundle also passed the **Publish updates** flow with dirty content: the editor saved and republished it, and the public article showed the new summary without deployment. The paragraph block's contextual accessible name was confirmed in the actual accessibility tree. The browser uploaded a synthetic PNG, confirmed WebP normalization and a private preview, then published it. The mobile inquiry inbox persisted a resolved status and internal note; its detail view and the media table had no document overflow at320px. [The media screenshot](verification/phase-3-admin-media.png) shows disposable fixtures, not seeded company claims.

These observations cover those journeys only; they do not establish an exhaustive accessibility audit or every interaction on every module. Other record kinds, permission combinations and lifecycle cases are covered by the focused API/SDK suite in the final [verification record](verification/phase-3.json). Reduced-motion rules were reviewed in source; browser motion-preference emulation and a full assistive-technology audit were not performed. Full public page layouts remain Phase4.
