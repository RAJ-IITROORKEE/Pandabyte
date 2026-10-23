# Clerk and InsForge setup checkpoint

Updated 23 October 2026. This is an authorized foundation slice, not a completed identity/data phase or a production deployment.

## Connected services

- Clerk SDK `@clerk/nextjs` 7.9.20 uses the owner's existing development keys. No replacement application. The owner later approved two disposable development users for isolation tests; all test users and grants are scoped and cleaned up. The owner registered through Google; the real `/account` session and signed-in navigation are verified in the built-in browser.
- The selected existing Clerk app remains `app_3L6TKANHqV7XNlc22Pwvhk4oLWn`, development instance `ins_3L6TKBiLRXyJbJGRnpa9t3gvFAI`. The earlier “External Account was not found” happened before customer signup, when Brave showed **No users yet**. Dashboard administration and application customer registration are separate; no key replacement was needed.
- InsForge CLI is authenticated and linked to existing **Pandabyte**, project `988b987b-f809-4cd5-94b2-c1d1e5cc9120`, region `us-east`. No duplicate project or region change. API base: `https://r2g8wzib.us-east.insforge.app`.
- Initial table listing returned `[]`; `SELECT 1 AS connection_ok` passed. The subsequent reviewed [identity migration](../migrations/20261023171953_clerk-identity.sql) adds only an application-owned identity helper and its grants. That historical baseline has since been extended by the authorized [Phase 2 access migrations](phase-2-access.md): owner-scoped profiles/files, server-controlled capabilities/audit and one private bucket.

## Credentials and verified bridge

`.env.local` is ignored and retains the owner's Clerk configuration. The public InsForge base URL was added without printing existing keys. `.insforge/project.json` is ignored and contains privileged CLI linkage credentials; it must never be imported into app code. A user API key authenticates the CLI, not the browser application. No privileged project key is assigned to a `NEXT_PUBLIC_` variable.

The real Clerk → InsForge identity round trip now passes, using the [official integration](https://insforge.dev/integrations/clerk) and version-checked SDK:

1. A template named `insforge` was created in the same verified development instance through the supported [Clerk Backend API](https://clerk.com/docs/reference/backend-api). Custom HS256 signing uses the linked InsForge project's JWT secret, retrieved privately through its CLI and sent directly to Clerk. No key was printed, committed or added to browser configuration. The installed integration reference describes dashboard setup; the current Backend API also supports it.
2. Claims are `role: authenticated` and `aud: insforge-api`; Clerk supplies `sub` and `iss`. Lifetime is 60 seconds with 5 seconds clock skew. Clerk remains the sole identity provider.
3. Exact SDK `@insforge/sdk` 1.5.2 is installed. [Server client](../lib/insforge/server.ts) requires an active Clerk session, obtains a template token per request, and constructs a fresh client. It uses no admin or anon key and maintains no shared mutable user token. No browser SDK singleton or refresh interval is needed for this server-only slice.
4. The migration creates `public.requesting_user_id()` as a stable SQL `SECURITY INVOKER` function with a pinned search path. It returns the trusted text subject, grants execution to `authenticated`, and explicitly revokes `PUBLIC`/`anon`. Existing-function absence and migration history were checked first. A paid backend branch was unnecessary for one additive helper on the empty development project; no existing data/auth configuration was replaced.
5. `/account` compares the database-returned subject to Clerk's verified subject before showing connection success. It renders a safe error state on a missing token, query error or mismatch; private identifiers/tokens/raw provider errors are not rendered.

The helper and JWT bridge establish identity. The later [Phase 2 access foundation](phase-2-access.md) implements owner-only profiles/files and capability checks; live access and lifecycle results are tracked in [phase progress](phase-progress.md). No staff role was granted to the owner's customer account.

Dependent policies now exist; do not drop the identity helper in isolation. Follow the ordered compensating migration guidance in [Phase 2 access](phase-2-access.md), review dependencies first and keep applied migration history immutable. The Clerk template is additive; remove it only as a deliberate coordinated rollback, since removal stops the bridge. No backup/restore capability is claimed by this helper-only migration.

## Verification and limits

Production build, TypeScript and lint passed. The built-in browser confirms the registered user's active session and “Your account connection is verified.” Signed-out `/account` still redirects to sign-in. SQL privilege checks show `anon_execute=false`, `authenticated_execute=true`. Three direct SDK checks reject anonymous, malformed and wrongly signed authenticated claims with 401 and no identity data. Run `npm run test:auth` with the dev server, and `npm run test:backend` against the selected development backend. The latter explicitly loads the ignored .env.local through Node; no credentials are output.

Next's loopback hostname rewrite produced local 500s with `--hostname 127.0.0.1`; using `--hostname localhost` resolved the observed failure. See the [upstream issue](https://github.com/vercel/next.js/issues/94745). Local scripts stay on localhost; no production network binding decision is implied.

The browser identity check passed again after 89.7 seconds, beyond the 60-second token lifetime: a fresh server request obtains a usable current template token. This does not prove explicit rejection of an expired token or multi-user switching. Subsequent customer/staff/storage results are recorded separately; no orders, payments, production keys or deployment are claimed. See [phase progress](phase-progress.md).
