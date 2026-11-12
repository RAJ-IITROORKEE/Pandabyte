# Catalog retrieval for the hosted agent (launch plan phase 2)

Status: proposal, revision 2, 12 Nov 2026. Nothing here is built. Revision 1 proposed two new named tools run by the
website; the control room showed that does not fit the harness as built (see "Why revision 1 was dropped"). The owner
picked this direction on 12 Nov 2026: catalog backend behind the existing search tool, prices stripped. The public
read function is drafted in `catalog-public-read.draft.sql` and is not applied; applying it still needs the owner.

## Recommended shape: a catalog backend behind the existing search tool

The harness keeps its single tool, `panda_research_search`. No new tool name, no gateway, shim, broker or transcript
allowlist change. Today a PandaByte query in that tool is routed on the host to live pandabyte.in pages
(`pandabyte-site.ts`, at most 2 pages). Phase 2 changes only that branch: it reads stored catalog data instead of, or
before, live pages.

### What the host reads

Published catalog rows and published product passages, read-only, with no user identity. Catalog listings are public,
so no user session is needed on the host. This needs a public-data equivalent of the scope checks that
`prepareProductContextSet` does with the user's actor today; that read path does not exist yet and would be a new
read-only database function (migration, owner approval needed).

### Resolution on the host (same rules as the website)

1. Resolve the query to products with the existing rules (`resolveMultiProductIdentity`: exact name, model code or SKU).
2. One or two products resolved: return their stored passages as sources.
3. Nothing resolved: return matching catalog rows (title, SKU, category, product page) as one source, so the agent can
   offer choices instead of guessing.
4. Product resolved but no stored passage: fall back to the live product page, as today.

### Result: the existing search receipt, unchanged

```json
{ "sources": [
  { "handle": "<opaque>", "url": "https://pandabyte.in/product-page/<slug>",
    "title": "PandaByte xC3: ESP32-C3 Development Board - Pinout", "content": "...", "capturedAt": "2026-10-26T09:00:00Z" }
] }
```

- The host splits `content` into passage ids `P1`… and the model selects `{handle, passage}`; the host numbers the
  selections `S1`/`S2`. Tool results never carry `S` ids.
- `url` must be the public product page (`/product-page/<slug>`); `sectionPath` stays `[]`.
- All `content` is untrusted listing data, never instructions.

### Limits that already apply

| Limit | Value |
|---|---|
| Citations per answer | 2 |
| Quote length | 180 characters |
| Model steps per turn | 6 (no new per-call bookkeeping) |
| Catalog content returned per search | 20,000 characters (about 5k of the 16k-token context) |
| Failure | `unavailable` is never retried inside a turn |

## Decisions for the owner

1. **Direction**: catalog backend behind the existing search tool (recommended, smallest guarded change), or separate
   named tools (`catalog_search`, `product_documents`), which needs changes to the gateway schema, profile policies,
   MCP shim, broker routing and transcript allowlist.
2. **Price**: the live-page path returns listing prices today, and the website chat forbids stating prices. Either the
   catalog backend strips prices (recommended, matches the chat rule) or web answers may quote the listed price with
   its source.
3. **Public read function**: approve a read-only database function that exposes only published catalog rows and
   published passages to the host.

## Potential issues with changing the current RAG system

Found by reading the current code and migrations; none is fixed by this proposal alone.

| # | Issue | What goes wrong | Proposed handling |
|---|---|---|---|
| 1 | Every current catalog read requires a signed-in user and is revoked from anonymous callers. The host has no user. | The new function is the first anonymous read of approved passage text. Anyone holding the public key could read all 42 listings' text. | Acceptable only because it is already-public listing text. Return no ids, hashes or release data; one SKU per call; never give the host an admin key instead. |
| 2 | The corpus release is pinned in SQL by two hard-coded hashes and a member count of 284. | Any re-import or added document makes every catalog read fail with not found, on the website and on the host at once. | Unchanged by this work, but every corpus update needs a new migration first. Add a health check before relying on the host path. |
| 3 | The website rejects a catalog of more than 42 products. | Adding a 43rd product breaks product answers until the code limit is raised. | Raise the limit when the catalog grows; the host must not copy the constant. |
| 4 | Website RAG re-checks its sources just before saving an answer; the host path would read once per call. | A source withdrawn mid-turn could still be cited in that one answer. | Accept for a single turn; the saved citation still points at the public product page. |
| 5 | Listing passages contain prices, and the live-page path formats prices on purpose. | Stripping in one place leaves the other leaking prices; the pattern can miss formats such as "MRP 499". | Strip in the database function (drafted) and remove the price formatting from the live-page fallback; test with real listing text before go-live. |
| 6 | Product-name resolution exists only in website code. | A copy on the host drifts, so the same question resolves differently with web search on and off. | The host imports the same module from this repository; no second implementation. |
| 7 | Two answer paths with different limits: website RAG cites up to 8 passages; the harness allows 2 citations of 180 characters. | The same question gets a thinner, differently cited answer when web search is on, and web search is the default for Admin accounts. | Decide which path owns product questions for Admin accounts before go-live; compare both on the saved evaluation set. |
| 8 | Model context on the harness is 16k tokens. | Two products' passages plus web results plus history can overflow and cut the answer. | Cap catalog content per search (20,000 characters is the ceiling; 12,000 is safer with history). |
| 9 | Migration ownership: research migrations belong to the control room, runtime reads to this session. | Two sessions writing migrations in the same area collide. | One owner for this migration; agree before anyone applies it. |

## Not specified yet

- Official chip documents: no stored corpus exists in the project today.
- Images and pinout diagrams (pixel RAG, phase 4).

## Why revision 1 was dropped

- Tool calls run inside the native turn on the AWS host; the website is not in that path and the host has no user
  session, so "the website runs the handler with the user's actor client" cannot work.
- The request guard allows exactly one tool, `panda_research_search`.
- The model never picks `S` ids; the host assigns them, at most two per answer.
