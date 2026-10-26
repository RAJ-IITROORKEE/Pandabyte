# C2 — Contact and About

Status: **in-progress** — implementation/source review complete; root integration and rendered verification pending.

References: pinned Contact v9 (`.superdesign/review/screens/contact.html`) and About v8 (`.superdesign/review/screens/about.html`), with the frozen fingerprints in `reference-inventory.json`. No reference files, new drafts or design assets changed.

## Owned changes

- `app/contact/page.tsx`: breadcrumb and larger title/summary, reviewed asymmetric contact-details/form panels, conditional published contact fields with Lucide labels, support/social/block content, and Help Center link. Uses C1 Card primitives. The empty details panel explicitly says its content has not been published.
- `app/about/page.tsx`: split company heading/content layout, catalog/contact actions, deliberate unpublished company/team panels, retained real TeamGrid and pagination, and contact-page callout. Published summary appears once above the actions; all existing document blocks remain rendered.
- `components/editorial/company.module.css`: page-scoped composition, tokens, panel spacing, focus outlines, wrapping and responsive columns. Both themes use existing foreground/surface/action tokens. No motion was added.
- This handoff record.

## Preservation and intentional reference differences

The source data calls, dynamic rendering, metadata, redirect handling, query parameters, bounded team page size/count/clamping/result cap and team renderer are unchanged. Contact still reads the nonce and existing protection configuration and passes both to the unmodified ContactForm. ContactForm/ContactChallenge, their field names, state handling, validation, idempotency and API submission remain untouched. No form submission was performed.

Published contact email/phone/address/hours/timezone/support/social fields are now presented explicitly inside the details panel. Common published blocks still use PublishedDocument. Empty optional fields are omitted; summary remains visible in the page header. Contact data is not copied onto About. No contact facts, company claims, board-family image, team identities, brand/sponsor marks, FAQ answers or extra form fields/uploads were imported from the prototypes. About has no published media field, so a stock photo was not invented to fill the reference image position. No server data model or API changes were needed.

Shared editorial CSS, global styles, SiteFrame, homepage hero, packages, `.superdesign/`, source/CAD archives and other-chat changes were not edited by this lane.

## Verification

- Passed: targeted ESLint via `node node_modules/eslint/bin/eslint.js app/contact/page.tsx app/about/page.tsx` (exit 0).
- Passed: `git diff --check -- app/contact/page.tsx app/about/page.tsx components/editorial/company.module.css` (exit 0).
- Source reviewed: installed Next page/CSS guidance, Ponytail, UI/UX Pro Max and Vercel React Best Practices. Both routes stay server components, with no additional client bundle or data fetching.
- Pending root: integrated check/unit/build sequence; built-in-browser comparison at 320/768/1024/1440 CSS px in both themes; breadcrumb/CTA/help links, keyboard/focus, single main H1, no overflow, form/challenge disabled/status containment and existing published-content/media rendering. Preserve owner session; do not submit inquiries or mutate content.
- Actual zoom, screen-reader speech and runtime reduced-motion switching were not checked by this lane. No production/readiness claim follows.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
