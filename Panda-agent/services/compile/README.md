# Compile service (AWS Lambda)

Compiles one Arduino sketch for one PandaByte board with `arduino-cli` and returns a merged firmware image. Nothing is stored.

## Contract
`POST <function url>` with JSON `{ "board": "ESPXC3", "sketch": "<source, <= 64 KB>" }` (no other keys).
Boards: ESPXS3, ESPXC3, ESPXC3M, ESPXC5, ESPXC6, ESPX32, XLORA, ESPX8266.

- 200 `{ ok: true, board, fqbn, address: 0, size, sha256, binBase64, warnings, durationMs }` (flash at 0x0)
- 200 `{ ok: false, errors }` compile failure (paths scrubbed, first 4000 chars)
- 400 `{ ok: false, reason }` invalid request; 401 bad or missing signature

## HMAC
Headers `x-panda-timestamp` (unix seconds) and `x-panda-signature` = hex `HMAC-SHA256(secret, "<timestamp>.<raw body>")`. The timestamp must be within 60 s. The secret lives in Vercel and in Lambda env (`PANDA_COMPILE_SECRET`).

## Security limits
Function URL auth is NONE (the HMAC is the gate). Board allowlist; sketch <= 64 KB; includes only `[A-Za-z0-9_./-]+.h|hpp` with no absolute path, drive letter, `..` or backslash; `.incbin`, `__has_include`, `system_header`, `/proc`, `environ` and build-path strings are rejected. Compile runs with a cleared environment (no secret or AWS credentials), in a fresh `/tmp/build-<uuid>`, with a 100 s timeout (process group killed) and a 1 MB output cap. The role can only write its own logs. No library downloads (fixed, pinned set).

## Deploy
1. Create the stack without `ImageUri` (set `CompileSecret`, `GitHubUrl`); outputs give the repo URI and CodeBuild project.
2. `aws codebuild start-build --project-name <CodeBuildProject>`; note the pushed commit-sha tag.
3. Update the stack with `ImageUri=<RepoUri>:<sha tag>` (use the sha tag, not `latest`, so Lambda redeploys). Read `FunctionUrl` from the outputs.

## Cost
About $0.30-0.50/month (3-5 GB image in ECR) plus ~$0.002 per build; the Lambda free allowance covers ~3,000 builds/month. An image rebuild costs ~$0.10-0.15.
