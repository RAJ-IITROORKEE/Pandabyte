# Contact submission boundary

25 October 2026. Authorized development hardening; checkout/payments remain deferred.

The contact form now requires server-validated Cloudflare Turnstile before saving an inquiry. The historical anonymous `submit_inquiry` RPC is no longer executable by `PUBLIC`, `anon` or `authenticated`. A new wrapper requires a random, submission-only secret whose SHA-256 hash is stored in an RLS-enabled private configuration table. The Next route uses the existing anonymous SDK client plus this scoped secret; it does not use the project-admin/media credential. The wrapper preserves the existing atomic per-email/global quotas, receipt idempotency and private inquiry queue.

## Runtime configuration

Configure the following in ignored `.env.local` for development, and the authorized server environment for a future deployment. Never put secrets in Markdown, client props or public environment variables.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public widget key |
| `TURNSTILE_SECRET_KEY` | Server-only Siteverify secret |
| `CONTACT_SUBMISSION_KEY` | Server-only random 32-byte value represented as 64 lowercase hexadecimal characters |
| `CONTACT_SITE_ORIGIN` | Exact canonical origin; the API rejects other request origins |
| `CONTACT_TURNSTILE_MODE` | Explicit `local-test` or `live`; unset/invalid configuration disables submission |

The owner selected official test keys locally. `local-test` accepts only known official dummy keys on HTTP localhost/127.0.0.1 and refuses Vercel deployments. It accepts only the official dummy token and verifies Cloudflare's test-result marker. Cloudflare's test response uses `example.com` and omits the production action; it is deliberately not treated as proof of production validation. The widget displays this limitation.

Future `live` configuration requires HTTPS, non-loopback origin and non-test keys. Siteverify must return success, the exact configured hostname, action `contact`, a fresh challenge timestamp and no test-result marker. Tokens are bounded; verification has a 10-second timeout, a 16-KiB response bound, no redirects and no shared cache. Provider errors fail closed. Each verification gets a fresh provider retry UUID; the inquiry UUID remains stable for unchanged form retries. No untrusted forwarded IP header is used.

The widget loads only on Contact using Next Script and the trusted request nonce. Clerk's existing CSP permits its Cloudflare frame; no broad script exception is added. Compact sizing fits narrow screens. Rejected submissions keep entered text, reset verification and allow safe retry. Script failure keeps the form in place rather than reloading it. Successful submissions show plain confirmation, not the database receipt UUID. Email delivery remains explicitly unconfigured.

## Migration and key operations

`20261025115056_contact-abuse-boundary.sql` is applied to the linked development project only. A trusted project operator provisions the singleton configuration with SHA-256 of the UTF-8 hexadecimal secret; runtime roles cannot read or write it. The raw secret stays only in server configuration. Local bootstrap generated it without printing it; no backend-wide runtime key was added. Verify the hash matches configuration without logging either value.

For rotation, coordinate the server secret and private database hash during a maintenance window; a mismatch fails closed. Keep the legacy RPC revoked. Recovery is a reviewed forward migration/configuration repair, not regranting anonymous execution or resetting inquiry data. No destructive rollback/restore drill was performed.

## Verification and limits

See [recorded evidence](verification/contact-abuse.json) and [phase progress](phase-progress.md). Focused tests cover configuration, closed inputs, provider failure/invalid responses, exact live hostname/action/freshness, direct RPC/config denial, wrong proof, concurrent idempotency, changed-payload conflict and the existing email quota. Test inquiries are disposable and removed.

Production abuse protection remains a release gate until real domain-restricted keys and deployed behavior are verified. CAPTCHA-solving/distributed attackers or legitimate bursts can still exhaust the emergency 100/hour shared ceiling; Turnstile is not a complete denial-of-service guarantee. No trusted deployment IP limiter, load test, notification delivery or production provisioning is claimed.

Primary references: [official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), [server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/), [CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).
