# Public homepage, FAQ and About follow-up — 27 October 2026

The owner requested a different treatment for the homepage category section, six relevant FAQs through the existing API/database, an FAQ component review and an About page design. A subsequent request removed the “Shop” label above the Catalog heading. Work is limited to the public frontend and the six specifically requested development FAQs; the Admin frontend and protected homepage hero remain unchanged.

The category section now has an opaque, theme-aware background, concise introduction, catalog link and five responsive category links, so the homepage's decorative grid does not show through the section. The catalog heading no longer displays the redundant eyebrow. The About page uses the existing published page, team data and pagination, with a responsive editorial layout and a factual introductory fallback based on the owner's company description. Company and team empty states remain honest when records have not been published.

The FAQ component retains native `<details>` and `<summary>` for keyboard access and server rendering, with scoped responsive styling, a visible focus state and a plus/close indicator. Existing structured content remains rendered through `PublishedDocument`.

The current CMS uses `cms_records` and versioned `cms_revisions` for FAQ documents; no schema migration was needed. The following six new questions were created and published **in the existing development project** using the real, capability-checked Admin API, with expected-version checks. Their placements are `home` and `help`; their plain-text answers describe only existing catalog, product, resource and contact behavior. Source observations are explicitly described as historical, non-purchasable information.

- What can I find in the PandaByte catalog?
- How can I find a specific board or sensor?
- Where can I find product specifications?
- How do I check whether a product can be purchased?
- Where can I find guides and other resources?
- How can I get help with a product?

The authenticated operator was the existing protected development owner. The operation checked the project, Clerk development instance, owner capabilities, all candidate slugs and existing records before writing; it did not grant access or update other records. A task ledger remains under ignored `.bootstrap/faq-followup/`; unknown outcomes must be reconciled rather than retried blindly. All six published answers were then read back via the public detail APIs.

Verification: lint, TypeScript and build passed; 11 focused editorial/navigation tests passed. In the built-in browser, Home and Help each showed six FAQ questions, and Enter/Space opened and closed an answer while retaining focus. The About page and Home category/FAQ sections were checked at 320, 768, 1024 and 1440 CSS pixels in both themes with no horizontal overflow; the category background was opaque in both themes. The catalog heading was checked without its former “Shop” eyebrow. The homepage hero component, circuit and global theme styles were not changed. Screenshots and viewport measurements are retained under ignored `.bootstrap/home-faq-about/`.

These frontend changes do not establish complete launch readiness. Approved About/company and team CMS records, learning content, operational product offers, checkout/payment/shipping/tax integration, and full page-by-page design and accessibility verification remain outstanding. Actual screen-reader speech and runtime reduced-motion switching were not tested. No production deployment or production publication was performed.
