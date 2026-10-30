# Vercel hosted development preview

## Frontend backgrounds — 30 October 2026

The owner approved the faint backgrounds, requested light/mobile browser validation, commit/push and updating the existing preview. Application commits `95b4245` and `ac2ff13` add public/customer dots, original full-width hero PCB artwork with 2.8-second CSS signals in dark mode, and dots only behind the light-mode hero. Admin, the interactive product circuit, media access and commerce logic are unchanged. See `docs/frontend-theme.md` for the design and local checks.

The final clean Git archive of `ac2ff13` was deployed without build cache and promoted as **`dpl_HKaEdqn3J4sUJYVkD83biR3oegEQ`**, https://pandabyte-qx9sgumm4-unfiltered-iit-ians.vercel.app. The stable address remains https://pandabyte-iot.vercel.app. An earlier cached build of `95b4245` had the new hero but omitted the global dot CSS; direct stylesheet inspection and the hosted browser caught the mismatch. The final uncached build includes the dot declarations and light-mode PCB exclusion. Do not treat the earlier build as the final verified preview.

Verification: full ESLint, TypeScript, 441 unit and 10 media tests passed before the presentation commit; four focused theme/Admin-isolation checks passed after the CSS-only light-hero refinement. The final cloud build, TypeScript and all 37 static generations passed; package installation reported zero vulnerabilities. Hosted Home and Shop return 200; the Admin roles API returns 401 to anonymous requests. Both capability endpoints remain false (`simulationAvailable`, `razorpayTestAvailable`). No environment variable values were read or changed, and no account/cart/order/payment forms were submitted.

Codex browser checks show the hosted light hero with dots and `display: none` on the decorative PCB layer, dark mode with the faint PCB and a 2.8-second animation duration, and no page overflow. A visible hosted mobile tab at **320px CSS width** also shows dots-only light mode without horizontal overflow. Local Admin has neither the public shell nor hero PCB. Temporary viewport overrides were reset; the owner's existing 12-item cart was preserved. Performance tracing of the new background and actual OS reduced-motion switching remain unverified.

29 October 2026: the owner requested a new Vercel deployment, browser-entered environment variables and a short public default subdomain. This resumes the bounded hosted-preview operation; it does not complete Phase 6 or authorize live commerce, real invoice issuance, service data/content mutation, live email, load tests or restore operations.

## Deployment

- Public address: https://pandabyte-iot.vercel.app
- Vercel project: `unfiltered-iit-ians/pandabyte-iot`.
- Ready deployment: https://pandabyte-6hxlxc6nm-unfiltered-iit-ians.vercel.app
- Application source: Git commit `ad14528` on `main`, including the profile photo fix, desktop spacing and frontend theme checkpoints. Earlier deployments used `097e4fb` and `000189a`.
- Next.js preset, Node.js 24.x and `npm ci` were configured through the dashboard. Vercel CLI 50.34.1 created/linked the project and deployed a clean source snapshot of the reviewed Git tree. The cloud build succeeded; its install audit reported zero vulnerabilities. No local environment file, credential store, product/CAD archive, build cache or private tool checkpoint was uploaded.
- The deployment targets Vercel's **Production** environment for stable public routing, while the application deliberately uses the existing **development** Clerk/InsForge services. This is not a claim of production readiness.
- The short alias is attached to this ready deployment and configured for the project's Production environment. No custom domain was purchased and `pandabyte.in` was not moved.
- GitHub auto-deployment was not configured by this checkpoint. Future deployments must use reviewed clean source and verify the short alias against the ready deployment.

## Environment variables

Values were entered in the authenticated Vercel browser form, never printed, committed or placed in CLI arguments. Server credentials were saved using Vercel's non-revealable **Secret** type; public settings and explicit disabled flags use **Config**. All ten variables target Vercel Production only.

| Variables | Type |
| --- | --- |
| `CLERK_SECRET_KEY`, `INSFORGE_ANON_KEY`, `INSFORGE_EDITORIAL_STORAGE_READ_KEY`, `PRODUCT_MODEL_VALIDATION_KEY` | Secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_INSFORGE_BASE_URL` | Config |
| `INQUIRY_EMAIL_ENABLED`, `PANDABYTE_COMMERCE_SIMULATION`, `PANDABYTE_RAZORPAY_TEST_ENABLED` | Config, explicitly `false` |
| `CONTACT_SITE_ORIGIN` | Config, the short HTTPS address above |

Local Turnstile test credentials, contact submission/notification proofs, test-payment proofs and recipient details were not copied to the hosted environment. Contact sending remains unavailable until real site/secret keys and the matching scoped submission proof are configured. No email provider/billing settings or backend records were changed. Clerk remains in development mode; production identity configuration and the broad editorial storage credential's least-privilege replacement remain release gates.

## Verification

Nine bounded anonymous HTTPS checks pass on the short alias: Home and public catalog return 200; Billing and Admin redirect to their sign-in entries; customer Billing API and Admin roles API reject anonymous access with 401; checkout capabilities report simulation unavailable; robots disallows indexing; and the sample PDF returns 200 with bytes matching the reviewed local asset. Home responses retain CSP/nosniff and do not expose `X-Powered-By`.

Built-in-browser checks confirm the homepage hydrates without observed console errors or broken completed images, the catalog renders **42 published products**, and Clerk renders its Google/email sign-in form in development mode. Contact explicitly says sending is unavailable pending verification and its Send control is disabled. No login, account change, inquiry, cart update, order or payment was submitted. The local owner session was preserved.

The later profile checkpoint below verifies hosted Google sign-in and the owner's profile read/preview/cancel flow. Other account mutations, hosted Admin behavior, real contact protection/delivery, full browser/accessibility coverage, capacity, recovery and production-business readiness remain unverified. The site retains development-preview wording and noindex/robots protection.

## Frontend spacing update — 29 October 2026

The owner authorized 1440px desktop outer containers and 24px horizontal padding across public/customer pages, Brave validation and updating this hosted preview. See `docs/frontend-desktop-spacing.md` for route coverage, preserved inner document widths and local browser evidence. Admin, hero design, mobile rules, service records and payment settings were unchanged by the spacing checkpoint.

Vercel CLI deployed a clean Git archive of `097e4fb` using the existing project/environment, excluding local configuration, archives, caches and private checkpoints. The cloud production build and TypeScript checks passed; package installation reported zero vulnerabilities. The ready candidate was promoted to the existing project routing as deployment `dpl_2xS344F8gT2GXxriz1uEacWVbtd6`; the stable address remains https://pandabyte-iot.vercel.app. The Production environment still hosts the bounded development preview; no new environment variables were entered.

Brave at 1536px confirms the stable hosted homepage and catalog use 1440px containers with 24px gutters and no document overflow. Hero images completed loading, and no browser console errors were observed in the checked tab. Anonymous HTTPS requests to Home, Shop, About, Contact and Help return 200 on the application host. The stable application's JSON capability responses confirm `simulationAvailable: false` and `razorpayTestAvailable: false`. No order, payment or contact submission was performed. Hosted signed-in customer flows and screen-reader speech were not rerun.

## Profile photo deployment — 29 October 2026

The owner explicitly requested deployment of the latest `main` and verification of the profile fix, keeping payments and real invoice issuance disabled. Local and fetched `origin/main` both resolved to `ad145282e2fa3ebb30733b8f8d8cb60e0294a2c1` before deployment.

Vercel CLI deployed a clean Git archive of that exact revision to the existing project and Production environment, first using `--skip-domain`, then promoting the Ready build to the stable address. Deployment: `dpl_4qvMwiaZWpgbrzuAaQD1T36aqzjv`, https://pandabyte-6hxlxc6nm-unfiltered-iit-ians.vercel.app. CLI inspection of `pandabyte-iot.vercel.app` resolves to this Ready deployment. The cloud build, TypeScript and all 37 static-page generations passed; installation reported zero vulnerabilities. Existing environment variables were retained without value reads or changes. No local credentials, source/CAD archives, build output or unrelated uncommitted UI work was uploaded. The protected candidate URL's Vercel sign-in redirect was respected; deployment protection was not changed.

Stable-host verification:

- Anonymous Home and Shop return 200. Profile redirects anonymous requests to Sign in, and `/api/account/profile` returns 401.
- Both JSON checkout capabilities remain false: `simulationAvailable: false`, `razorpayTestAvailable: false`. The general payment route remains the unchanged `payment_not_configured` response; no payment request was submitted.
- The sample invoice PDF returns 200 and its SHA-256 matches the reviewed repository asset. Real invoice issuance remains absent/disabled; no invoice was issued.
- The built-in browser completed normal returning-account Google sign-in with the existing owner account, loaded the hosted profile and its private form, and rendered the saved avatar at **112×112** with the image loaded and `object-fit: cover`.
- Choosing the disposable local PNG showed the local-only preview and enabled Save. Unsupported text and a PNG larger than 5 MiB were rejected with `aria-invalid` and the linked error. The preview remained 112×112 at a 320px viewport without document overflow.
- Cancel restored the saved avatar, disabled the unchanged Save action, cleared feedback and returned focus to Choose photo. The viewport override was reset and no console errors were observed in the checked hosted tab. No Save action, actual photo upload, profile/address/cart/order mutation, contact submission or invoice/payment action was performed.

The profile fix already passed its 14 focused local checks, scoped ESLint and TypeScript before source commit `ad14528`. The actual Clerk upload/save was intentionally not repeated against the owner's account. Raw logs and screenshots remain ignored local evidence. This record is documentation only; subsequent uncommitted cart/button work belongs to a separate checkpoint.

## Product-card cart controls — 29 October 2026

The owner authorized a disposable-account cart test and a preview update. On localhost:3000, a disposable customer added an existing catalog product, increased its quantity, reloaded to confirm persistence, entered a quantity, decreased it and removed the last item. The cart badge and product-card controls reflected each saved state. The owner account was restored with its original 11-item cart count; the disposable accounts and their carts were removed.

A clean Git archive of `8c04cf8` was deployed and promoted to the existing preview as `dpl_HoXUorKriZDz7aH9x5oKkn5MDCve`. The Vercel build and TypeScript passed; the stable Home and Shop returned 200, and the browser rendered the 42-product catalog. Both checkout capability endpoints reported disabled. Hosted signed-in cart mutations and payment transactions were not tested.

## Cart latency investigation — 30 October 2026

With a disposable customer, the hosted cart read and a version-checked update measured approximately 768 ms and 659 ms respectively in direct requests. In the Codex browser, updates sometimes remained pending much longer; these measurements do not establish the cause of that browser delay. Add-to-cart from a loaded product card previously made an additional cart read. Commit `87051c0` uses the matching-user versioned snapshot for that action and retains the server conflict guard. The focused cart tests, ESLint, TypeScript and Vercel build passed. A clean archive of that commit was promoted as `dpl_A5Jtchp2HGUyZK1fKxa6iDP89ic9`.

The disposable browser test on the previous deployment verified add, increment, entered quantity, decrement and last-item removal. On the updated deployment, add and entered quantity were verified; the browser delay remained observable. Both checkout capability endpoints remained disabled. No payment was attempted. This change removes one request from card additions; it does not establish a fix for the longer observed browser delay.
