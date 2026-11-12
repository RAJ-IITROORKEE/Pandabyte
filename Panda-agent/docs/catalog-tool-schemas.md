# Catalog retrieval for the hosted agent (launch plan phase 2)

Status: proposal, revision 2, 12 Nov 2026. Nothing here is built. Revision 1 proposed two new named tools run by the
website; the control room showed that does not fit the harness as built (see "Why revision 1 was dropped"). The owner
has not yet picked a direction.

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

## Not specified yet

- Official chip documents: no stored corpus exists in the project today.
- Images and pinout diagrams (pixel RAG, phase 4).

## Why revision 1 was dropped

- Tool calls run inside the native turn on the AWS host; the website is not in that path and the host has no user
  session, so "the website runs the handler with the user's actor client" cannot work.
- The request guard allows exactly one tool, `panda_research_search`.
- The model never picks `S` ids; the host assigns them, at most two per answer.
