# Clerk and InsForge setup checkpoint

Updated 23 October 2026. This is an authorized foundation slice, not a completed identity/data phase or a production deployment.

## Connected services

- Clerk SDK `@clerk/nextjs` 7.9.20 uses the owner's existing development keys. No replacement application or test user was created. Provider, visible controls, sign-in/sign-up routes, Next 16 proxy and server-gated `/account` are implemented.
- The selected existing Clerk app is `app_3L6TKANHqV7XNlc22Pwvhk4oLWn`, development instance `ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI`. Its Brave dashboard Users page showed **No users yet**. A dashboard administrator account is separate from customer registration. Register through the local Sign up page once; no API-key replacement is indicated by “The External Account was not found.”
- InsForge CLI is authenticated and linked to existing **Pandabyte**, project `988b987b-f809-4cd5-94b2-c1d1e5cc9120`, region `us-east`. No duplicate project or region change. API base: `https://r2g8wzib.us-east.insforge.app`.
- Read-only `db tables --json` returned `[]`; `SELECT 1 AS connection_ok` returned one row containing `1`. No application schema, rows, buckets or policies were created or changed.

## Credentials and remaining bridge

`.env.local` is ignored and retains the owner's Clerk configuration. The public InsForge base URL was added without printing existing keys. `.insforge/project.json` is ignored and contains privileged CLI linkage credentials; it must never be imported into app code. A user API key authenticates the CLI, not the browser application. No privileged project key is assigned to a `NEXT_PUBLIC_` variable.

Clerk → InsForge user authentication remains pending. Follow the [official integration](https://insforge.dev/integrations/clerk) and the installed integration skill against the chosen development project:

1. In the same Clerk development instance, configure a JWT template named `insforge`, custom HS256 signing, with the InsForge project's JWT secret. Retrieve that secret through the official CLI only when configuring the template; enter it directly in the intended secure dashboard field, never chat or project Markdown.
2. Set claims `role: authenticated` and `aud: insforge-api`; Clerk supplies `sub` and `iss`. Keep Clerk as the sole identity provider.
3. Before app integration, pin/recheck the actual SDK API. The reviewed 1.5.2 source uses `setAccessToken`; older examples showing `setAuthToken` must not be copied blindly. No unused SDK dependency/client was added at this checkpoint.
4. Create reviewed migrations/RLS using text Clerk subjects and `requesting_user_id()`. Use request-scoped server clients; test anonymous/customer/staff access, token expiry/refresh, sign-out and user switching with real identities. Do not infer these checks from the privileged CLI probe.

## Verification and limits

Production build, TypeScript and lint passed for the auth integration. The built-in browser rendered the Google/email sign-in form, and `/account` redirected signed-out visitors. Mobile sign-in had no horizontal overflow at 320 px; the current OS theme was used. HTTP regression tests cover public entry points, signed-out account protection, and external/duplicate redirect clamping: with the dev server running, `node --test tests/auth-routes.test.mjs`.

Next's loopback hostname rewrite produced local 500s with `--hostname 127.0.0.1`; using `--hostname localhost` resolved the observed failure. See the [upstream issue](https://github.com/vercel/next.js/issues/94745). Local scripts stay on localhost; no production network binding decision is implied.

Google OAuth returned “The External Account was not found”; the selected development instance had no registered users. Positive session verification remains pending owner registration/login. No claim is made for live customer RLS, storage permissions, staff privileges, orders, payments, production keys or deployment. See [phase progress](phase-progress.md).
