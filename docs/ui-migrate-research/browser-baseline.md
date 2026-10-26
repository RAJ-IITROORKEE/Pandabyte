# UI migration — observed browser baseline

26 October 2026, Asia/Calcutta. Source HEAD `8178ce0`. This is **before-migration planning evidence**, not validation of implemented UI changes. No application/library/skill installation or code migration occurred.

## Method and scope

Root used the built-in Codex in-app browser to inspect the selected Superdesign PandaPulse page and localhost. The localhost server was initially unavailable (`ECONNREFUSED`); root started the existing `npm run dev` script on `http://localhost:3000`. Next 16.4.3 reported ready. The first browser navigation timed out during cold compilation; a subsequent current-state check showed the same tab loaded successfully. These observations are not a production speed measurement.

The comparison viewport was requested and confirmed as 1440×1000 CSS px for the product/catalog/company/Admin observations. Screenshots are representative dark-mode states, not the full future four-width/two-theme matrix. No real inquiry was submitted, no Admin lifecycle/record/pricing/stock/role action was invoked, and no customer record was saved/deleted or session signed out. Existing normal owner access remained visible. Admin inspection was the dashboard/counts shell, not private record details.

## Observations

| Surface | What was actually observed | Planning consequence |
| --- | --- | --- |
| Selected Superdesign product v9 | Neutral charcoal/emerald theme; breadcrumb; contained image at left; title/SKU/price and illustrative cart area at right; kit/details/resources/reviews/footers below. | Use visual composition/tokens. Do not copy the prototype's offer/cart state into source-observation data. |
| Local Home `/` | Existing v26-style 40/60 circuit hero, active real Clerk account controls, source-backed categories/latest products, support and empty FAQ content. | Preserve hero; only lower section/shared presentation can migrate. Empty content is not a theming defect. |
| Local Catalog `/shop` | 42 published source-observation products, category/filter/search/sort/pagination controls. Search for exact SKU `xC3KITV2` returned the single PandaPulse result. | Retain real server/URL query behavior and non-offer state while tightening the visual layout. |
| Actual PandaPulse `/products/pandabyte-esp32c3-arduino-iot-kit` | Full-width H1 above gallery/right archived-source panel; original poster gallery; source price/capture caveat/link; explicit current price/availability unset and purchasing disabled. | Align the title/gallery/summary composition with the selected draft while retaining these truthful business states and current actual route. |
| Local Contact `/contact` | Generic stacked heading, unpublished-details state, existing name/email/optional phone/subject/message form and development challenge state. | Provide a deliberate missing-details composition and restyle existing form. No prototype office copy, upload feature or email-delivery claim may be invented. |
| Local About `/about` | Generic heading and company-content-not-published empty state. | Themed empty layout first; factual sections require actual published fields, not fabricated records. |
| Local Admin `/admin` | Owner's guarded dashboard loaded; fixed 280px desktop navigation; real module counts (including 42 products and 96 media), unavailable order management. No desktop resize/collapse control was present. No document overflow at the observed 1440px width. | Add the requested sidebar UI behavior around the current guards and real modules, not a replacement backend or fake dashboard. |

## Captures

- [Selected product reference, dark desktop](screenshots/reference-product-dark-1440.png)
- [Current catalog, dark desktop](screenshots/local-catalog-dark-1440.png)
- [Current product, dark desktop](screenshots/local-product-dark-1440.png)
- [Current Contact, dark desktop](screenshots/local-contact-dark-1440.png)
- [Current About, dark desktop](screenshots/local-about-dark-1440.png)
- [Current Admin dashboard, dark desktop](screenshots/local-admin-dark-1440.png)

These local screenshots may show the existing account avatar/name. They are evidence in the local workspace, not approval to publish them externally. They contain no captured credential/configuration values or private customer record bodies. No website content/design was changed merely to obtain them.

## Known baseline warning / remaining coverage

The development server/browser reported a hydration attribute warning at a `beforeInteractive` script: server/client nonce attribute representation differed (`undefined` versus empty). The issue badge was visible before migration. This is an **observed baseline warning**, not a proven cause/production failure or a new migration regression. Reproduce in the appropriate execution mode and preserve strict CSP; no security/configuration fix or blanket suppression was performed in this UI planning checkpoint.

Not run: post-migration checks (no migration exists), dependency installation/runtime pilot, full responsive/theme matrix, real keyboard journey regression, actual zoom/text resizing, runtime reduced-motion switching, screen-reader speech, Lighthouse/Web Vitals, load/capacity tests or deployment checks. Reference versions/hashes were independently read through the authenticated official Superdesign CLI in [reference-inventory.json](reference-inventory.json); no draft mutation/generation occurred.
