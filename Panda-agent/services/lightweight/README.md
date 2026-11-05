# Private lightweight evidence selector

The provider is OFF by default: `PROFILES_V1` contains no approved profile. `/health` is liveness; `/ready` remains 503 until a reviewed profile and key are configured. Fixtures inject providers or an HTTP transport in tests only. They do not prove provider compatibility, cost, privacy, quota, ARM64 image behavior, or authenticated application integration.

Runtime configuration names: `PANDA_LIGHTWEIGHT_SECRET` (at least 32 UTF-8 bytes), `PANDA_LIGHTWEIGHT_JOURNAL` (private persistent SQLite path), `PANDA_LIGHTWEIGHT_PROFILE` (key in the reviewed versioned allowlist), and `PANDA_LIGHTWEIGHT_OPENROUTER_KEY`. Without a valid secret and approved profile the selector remains disabled. Keep the journal and secrets private. The volume must be writable by UID 10001; run one worker and do not place it in a public asset directory. Remote access requires an authenticated HTTPS boundary; local-only HTTP is for host-private use.

The container limits Uvicorn to 32 connections and a five-second keep-alive. Capabilities are checked before reading a body; at most 32 bodies may be read concurrently, each with a five-second deadline and a 98,304-byte maximum. These ingress bounds are separate from the one-active/four-queued execution limit.

After the body is read, an observed client disconnect rejects a turn that is still queued; it never reopens that turn. Once dispatch is marked, the provider result remains eligible for private reconciliation. Shutdown conservatively marks unresolved queued or dispatched turns unknown. A network disconnect that has not yet been delivered by ASGI cannot be inferred before dispatch.

For local fixtures, from this directory, install the pinned `requirements.txt` into an isolated virtual environment and run `python -m unittest discover -s tests -v`. Build the container with `docker build -t panda-lightweight .`; image and resource-envelope validation are separate gates. The image contains no model weights, vector store, browser, shell tool, or legacy runtime.

From the repository root, with Docker available:

```sh
docker build -t panda-lightweight Panda-agent/services/lightweight
docker volume create panda-lightweight-data
docker run --name panda-lightweight --cpus=1 --memory=512m --memory-swap=512m --pids-limit=64 --read-only --tmpfs=/tmp:rw,nosuid,noexec,size=64m --cap-drop=ALL --security-opt=no-new-privileges --env-file=Panda-agent/services/lightweight/.env.local --mount=type=volume,source=panda-lightweight-data,target=/data --publish=127.0.0.1:8080:8080 panda-lightweight
```

Configure the four names from `.env.example` in the ignored `.env.local` before starting. The shared secret must match the BFF, while the BFF/database key stays outside this container. An empty provider profile gives a real disabled response and `/ready` 503. Stopping this container preserves the named journal volume. Do not delete the journal to make an unknown turn executable again.

The Web app remains on localhost:3000 (3001 if occupied), with the namespaced Agent settings from the root `.env.example`. Start it using `npm.cmd run dev -- --port 3000` after configuring the existing approved Clerk environment; no replacement identity provider is required. Set the BFF URL to the private selector address. Feature OFF is disabled, and feature ON imports only the new coordinator; there is no native fallback. Roll back activation by setting `PANDA_AGENT_LIGHTWEIGHT_ENABLED=false` and restarting Web; stop the isolated container separately while retaining its journal and keys.

FastAPI 0.162.0 requires `opentelemetry-api`; the pinned environment includes that API dependency but no telemetry SDK or exporter is configured. Starlette 1.10.0 currently warns that its HTTPX-based test client is deprecated; fixture tests still run with the existing HTTPX dependency. The PyPI version advisory records for the 17 resolved pins returned no listed vulnerabilities when checked on 5 November 2026; this is a point-in-time check, not a security certification.

The OpenRouter request uses one fixed endpoint and no fallback. Profile inclusion requires current verified endpoint/model identity, compatible context and JSON output, all applicable zero prices, provider privacy and ZDR, and account quota evidence. The request opts into usage and routing metadata and rejects missing or nonzero reported cost. See [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) and [OpenRouter support](https://openrouter.ai/support). Metadata can identify a provider display name without proving its endpoint variant; verify the selected variant independently before enabling a profile. No live endpoint has been approved here.
