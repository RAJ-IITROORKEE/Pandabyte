# Vercel hosted development preview

29 October 2026: the owner requested a new Vercel deployment, browser-entered environment variables and a short public default subdomain. This resumes the bounded hosted-preview operation; it does not complete Phase 6 or authorize live commerce, real invoice issuance, service data/content mutation, live email, load tests or restore operations.

## Deployment

- Public address: https://pandabyte-iot.vercel.app
- Vercel project: `unfiltered-iit-ians/pandabyte-iot`.
- Ready deployment: https://pandabyte-16fjj2s7q-unfiltered-iit-ians.vercel.app
- Application source: Git commit `000189a` on `main`.
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

Signed-in hosted account/Admin behavior, OAuth completion, real contact protection/delivery, full browser/accessibility coverage, capacity, recovery and production-business readiness remain unverified. The site retains development-preview wording and noindex/robots protection.
