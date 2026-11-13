# Panda Agent: compile service, tool controls and progress UI plan (14 Nov 2026)

Owner request (14 Nov): plan first with the cheapest workable costs (no real users yet); compile ESP32 sketches, flash boards and
read serial logs with clear progress, permission and question cards (affectUI-style patterns); Admin control of every tool with
sensible defaults on; Tavily web search on by default with an Admin switch and its monthly free usage shown; fix the context
meter and add the ai-elements Context component; build with Sonnet 5.5 subagents, ship to Admin, test live, then open to every
signed-in user.

## 1. Compile service: options and costs

Assumptions: a few builds a day, ESP32 Arduino sketches, region ap-south-1 (Mumbai). Prices are AWS/GitHub list prices.

| Option | Fixed per month | Per build | Build time | Notes |
| --- | --- | --- | --- | --- |
| **AWS Lambda container (recommended)** | ~$0.30-0.50 (3-5 GB image in ECR at $0.10/GB) | ~$0.002 (3 GB x 40 s); the monthly Lambda allowance of 400,000 GB-s covers ~3,000 builds | 20-40 s warm, 60-90 s cold | Each build isolated, nothing runs when idle. Image built once by CodeBuild (~$0.10-0.15 per rebuild). |
| CodeBuild per compile | $0 | ~$0.015 (3 min) | 2-4 min (VM start) | Too slow for chat. |
| Research EC2 host (control room) | $0 extra | $0 | 20-60 s | Shares the control room's host; needs that session's agreement. |
| GitHub Actions, private repo | $0 (2,000 free min) | $0 | 2-4 min | Slow; sketch code in workflow logs; extra token plumbing. |
| Dedicated t4g.small EC2 | ~$12-15 | $0 | 30-60 s | Always-on cost for no users. |
| Vercel Sandbox | unclear | CPU time + toolchain install each run | 1-3 min | Toolchain (1-2 GB) per run unless snapshotted. |

Docker is not installed on this machine, so the image is built in AWS CodeBuild from a Dockerfile in the repo (no local Docker).
AWS CLI 2 is set up but has no live session; deploying needs the owner to sign in (or a least-privilege deploy user).

### Design (Lambda)
- Image: Amazon Linux base + Node 24 + arduino-cli + cores for the boards PandaByte sells (esp32: ESP32, S3, C3, C5, C6;
  esp8266) + a small allowlist of libraries (Adafruit BME280/SSD1306/GFX/NeoPixel, DHT, PubSubClient, ArduinoJson). A blank
  sketch is compiled per board while building the image, so later builds reuse the core cache (sketch + link only).
- Lambda: 3008 MB, 120 s timeout, x86_64, role with CloudWatch Logs only (no other AWS access), 1-day log retention.
  Function URL with auth NONE plus an HMAC-SHA256 header (secret in Vercel and Lambda env; 60 s timestamp window).
- Input checks: board from an allowlist (PandaByte SKU -> FQBN), sketch <= 64 KB UTF-8, `#include` only of allowlisted library
  headers or files in the sketch (no absolute paths, no `..`), no library downloads, compile runs with a cleared environment in
  a fresh /tmp dir, output capped (errors first 4 KB).
- Output: merged `.bin` (flash at 0x0) as base64, size, warnings/errors. Never stored; it streams to the browser once.
- Caps: Admin unlimited for now; signed-in users 10 builds per India day (migration), shown in Admin.

## 2. Agent and UI flow (compile, flash, serial)
- New agent tool `compile_sketch` (server): compiles the agent's sketch for the board. Errors go back to the model to fix
  (at most 2 builds per turn). Success streams a `firmware` event to the browser.
- Firmware card in the chat: board, size, build time, [Flash to board]. Flashing is always started by the user: the card opens
  the Device panel's existing confirmation (chip, file, size, address 0x0; chip-id check). No agent tool can flash.
- Serial logs: Device panel "Ask the agent" (live) plus a card button "Share serial log" after a flash.
- Progress (affectUI patterns): the thinking panel gains tool rows (Compiling for ESP32-S3 ... 34 s, Reading xS3 listing,
  Searching the web) with running/done/failed states and durations, under the existing plan checklist; questions use the
  existing question dock; MCP approvals keep their Allow once / Don't allow card.

## 3. Admin tool controls and Tavily usage
- Admin > Agent Skills > Tools tab lists every agent tool with what it does, where it runs and a toggle:
  - Required (locked on): search_catalog, read_product, ask_user, final_answer.
  - On by default: find_pinout, plan, web_search (Tavily), load_skill, open_mcp_server / MCP tools, compile_sketch, Device panel.
  - Off by default: the web-research helper (env flag today; becomes this toggle).
- Settings live in a new table read every turn; a disabled tool disappears from the model's tools and its prompt line.
- Web search card: on/off, Tavily credits used this billing cycle vs the plan limit (Tavily `GET /usage`, cached 60 s), searches
  Panda Agent made this month (our journal), and the per-user daily cap.

## 4. Context meter
- Today it shows the last turn's input + output summed over every agent step, over the model's window, so it jumps with the
  number of steps (billed tokens, not context fill).
- Fix: track the largest single-step prompt (what the model actually holds) as "context used"; keep billed totals in the detail.
- Add the ai-elements Context component (Apache-2.0, vendored like shimmer/code-block): number + progress ring after it, hover
  card with input, output, cache reads and cost.

## 5. Rollout
1. Build and test (unit tests, local replays), deploy with every new tool Admin-only.
2. Live Admin test: tool toggles, Tavily usage, compile + firmware card + flash (owner with a board), progress rows, meter.
3. Open to all signed-in users: device panel and compile (with daily caps), skills and MCP catalog for members (migration;
   MCP secrets stay encrypted with a Vercel-only key), web search already on.

## 6. Owner approvals needed
- AWS: ECR repo, CodeBuild project, Lambda + Function URL, IAM role (logs only), ~$0.30-0.50/month. Deploy credentials.
- Migrations (dry run first): tool settings table + RPCs; compile daily cap; later, member access to skills/MCP.

## 7. Work split
- Subagents (Sonnet 5.5): compile service package (Dockerfile, handler, buildspec, CloudFormation, tests); Admin Tools tab +
  Tavily usage module; ai-elements Context component.
- Root: migrations, loop/chat/stream integration, tool rows, firmware card, deploys, live tests, rollout.

## Status (14 Nov 2026)
- Live for every signed-in user: Admin tool switches (migration 20261114100000) read every turn; Tavily card in Admin with
  credits from Tavily `/usage` (96 / 1,000 on the Researcher plan at first check); live tool-step rows in the thinking panel;
  the context meter (largest single step + hover card with billed input/output, steps and cost); MCP tools for signed-in
  users (migration 20261114110000); Device panel and compile tool for signed-in users (`PANDA_AGENT_DEVICE_MEMBERS=true`,
  10 builds a day for non-Admins).
- Verified live as Admin: Tools tab, a switch round trip (find_pinout off -> on, versions 2 -> 3), tool rows during a project
  question, meter card (23k of 1M; 61k billed input over 5 steps). Not verified as a non-Admin user (no test sign-in).
- Not live yet: the compile service. The code (services/compile) and the compile_sketch tool are deployed but inactive until
  the AWS stack exists and PANDA_COMPILE_URL / PANDA_COMPILE_SECRET are set. Waiting on the owner's `aws login`.
