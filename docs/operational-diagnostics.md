# Application error diagnostics

Scope: a local non-commerce hardening checkpoint after `019a6e5`. Add bounded, application-owned server events and error-response correlation; do not change identity, billing, data retention, production infrastructure or the deferred checkout/payment workflows. InsForge stays Free and real email stays disabled.

## Contract

- `lib/observability/events.ts` exports `buildOperationalEvent(kind,area,status)`, `logOperationalFailure(kind,area,status)` and `operationalJson(body,status,headers,area,expectedUnavailable=false)`.
- Event fields are closed: schema version, server timestamp, generated random UUID reference, allowlisted event/area and 500–599 status. No raw error, body, query, URL, header, database/Clerk/session ID, filename/object key, environment value or provider payload is accepted into an event. Invalid runtime labels fall back to fixed safe labels without coercing unknown objects.
- `operationalJson` preserves the existing body/status/security/cache/Location headers. Operational 5xx responses get a fresh `X-Error-Reference` matching exactly one `api_failure` event. Incoming or preexisting references are not trusted. No references are added to success/4xx bodies or visible UI. Routine 4xx and explicitly held Contact/notification setup 503 responses stay silent and have no error reference.
- Existing response helper families adopt this formatter: editorial, admin records/roles, cart, account files/profile/addresses, catalog and staff access. Returned SDK failures and catches mapped to 5xx are covered without logging caught objects. This reports safe failure class/area, not the underlying private provider diagnostic.
- Existing storage compensation warnings become separate allowlisted reconciliation events. A failed primary operation and a separately failed cleanup can legitimately produce two different events; they are distinct failures, not a promise of one event per entire request.
- Root `instrumentation.ts` uses this Next version's `onRequestError` for uncaught route/render/action/proxy failures. It logs only the allowlisted context type and an independent generated reference, never error/request/path/digest/context objects. It does not modify the framework's unhandled-error response or claim its reference appears there.
- No Proxy/CSP change, module-global request store, external sender, SDK, health endpoint, analytics, request tracing, polling or runtime fake-error route is added. The small logger fails open if console output throws so logging does not change business responses.

## Operations and limits

For a handled unexpected API failure, read `X-Error-Reference` in browser network details or a protected diagnostic client, then match that reference in the local server terminal. Use its static area/status and time for targeted investigation with existing authorized backend tools. Never paste private provider logs, tokens or full customer requests into public reports. Routine content/account screens continue to show plain error messages, without raw references.

These console events are local diagnostics, not monitoring or alert delivery. There is no central storage, guaranteed retention, sampling, distributed trace or uptime guarantee. Error storms can generate many small events; choose production log-volume/retention/access controls before deployment. This formatter adds no new data store and does not delete existing inquiry/audit/history records. Retention periods and recovery objectives still require owner decisions.

Next, Clerk, the SDK and hosting services retain their own diagnostic output. The new hook is a reporter, not a global scrubber; this checkpoint does not claim to redact their logs. Do not override global console to hide failures. Verify production log access/redaction and an alert destination separately. Uncaught framework errors have an independent event reference and no new response correlation promise.

## Verification

Focused tests inject hostile/dummy error data only into helpers/hooks, prove a closed payload, one matching reference/event per operational response, silent expected failures and preserved response headers/body. Test console failure and the uncaught hook without a runtime test endpoint. Browser checks cover genuine signed-in Admin/account/catalog flows and plain error/disabled states; no fake sessions, real email or owner-data changes. Record final evidence and a local commit before advancing.

Repeat with `npm run test:unit`, `npm run test:diagnostics`, `npm run test:security` and `npm run check` against the local production preview. `test:diagnostics` checks eight actual API auth/validation responses; operational 5xx and uncaught-hook behavior use isolated helper fault injection. The hook is compiled into the production artifact; no real unhandled exception is injected into the running application. The broader publishing/media/inquiry regression covers the changed response formatters.

Recovery is a code rollback of the formatter integrations/hook while preserving existing business response contracts. No database migration or retention cleanup is part of this change. See [verification evidence](verification/operational-diagnostics.json) and [phase progress](phase-progress.md) for final results.
