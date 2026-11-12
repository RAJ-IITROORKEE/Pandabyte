# Catalog tool schemas for the hosted agent (launch plan phase 2)

Status: proposal from the chat/UI session, 12 Nov 2026. Nothing here is built. The control room owns the harness side
(tool registration, budgets, transcript checks); the chat/UI session owns the website side (the handlers below).

## Rules both tools share

- Read-only. No tool writes, orders, reserves stock or sends anything.
- The website runs the handler with the signed-in user's own actor client, the same way `prepareMainRagContext` does
  today. The harness never receives a database key.
- Every string that comes back is untrusted listing data. The harness must treat it as data, never as instructions.
- No price, stock or availability field is returned. The agent must not state them.
- Input is rejected (`error: "invalid"`) when it has unknown keys, wrong types or is over the stated limits.
- One result envelope for both tools:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": "invalid" | "not_found" | "ambiguous" | "unavailable" }
```

`unavailable` is never retried inside a turn (same rule as provider calls today).

## Tool 1: `catalog_search`

Finds PandaByte products by name, SKU or category. Backed by `readRuntimeCatalog`, `resolveMultiProductIdentity`,
`categoryOf` and `chipFromTitle` (all existing). No model call, no embeddings.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "query":    { "type": "string", "minLength": 1, "maxLength": 200,
                  "description": "Product name, model code or SKU as the user wrote it. Omit to list a category." },
    "category": { "enum": ["boards", "kits", "shields", "modules", "accessories", "all"], "default": "all" },
    "limit":    { "type": "integer", "minimum": 1, "maximum": 10, "default": 5 }
  }
}
```

`data` on success:

```json
{
  "match": "exact" | "candidates" | "listing",
  "total": 42,
  "products": [
    { "sku": "PB-XC3", "title": "PandaByte xC3: ESP32-C3 Development Board",
      "category": "boards", "chip": "ESP32-C3", "sourceUrl": "https://pandabyte.in/..." }
  ]
}
```

- `exact`: the query resolves to one or more named products (what `resolveMultiProductIdentity` calls `planned`).
- `candidates`: nothing resolved exactly; these are title matches the agent should offer as choices, not treat as the answer.
- `listing`: no query was given; rows of the category, sorted by title.
- `chip` is `null` unless the chip name appears literally in the title (existing `chipFromTitle` rule).
- `total` is the count before `limit`, so the agent can say "and N more".
- No product matches: `ok: true` with `products: []`, not an error.

## Tool 2: `product_documents`

Returns the stored source passages for one product, so the agent can answer with citations. Backed by
`prepareProductContextSet` (existing): same scope checks, same 8-passage and 20,000-character caps.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["sku", "question"],
  "properties": {
    "sku":      { "type": "string", "minLength": 1, "maxLength": 128,
                  "description": "Exact SKU from catalog_search. Titles and guesses are rejected as not_found." },
    "question": { "type": "string", "minLength": 1, "maxLength": 500,
                  "description": "What to look for in this product's documents." }
  }
}
```

`data` on success:

```json
{
  "product": { "sku": "PB-XC3", "title": "PandaByte xC3: ESP32-C3 Development Board" },
  "passages": [
    { "id": "S1", "title": "Pinout", "sectionPath": ["Hardware", "Pinout"],
      "sourceUrl": "https://pandabyte.in/...", "capturedAt": "2026-10-26T09:00:00Z", "text": "..." }
  ]
}
```

- `id` is `S1`…`S8`, numbered per turn across all `product_documents` calls, so a second call continues at the next
  free number. These are the ids the agent writes as `[S1]` markers and the ids in `citations[i].id` (control room item 4).
- Product exists but has no stored passages for the question: `ok: true` with `passages: []`. The agent must then say
  it has no PandaByte source for that fact; it may still give general knowledge, labelled as such.
- Unknown SKU: `not_found`. The agent should call `catalog_search` first.

## Limits for the harness to enforce

| Limit | Value | Why |
|---|---|---|
| `catalog_search` calls per turn | 3 | One lookup, one retry with a corrected name, one category listing |
| `product_documents` calls per turn | 2 | Covers a two-product comparison; keeps context under the 16k limit |
| Passage text returned per turn | 20,000 characters | Existing retrieval cap |

## Citations in the final answer

The harness maps each `[Sn]` marker it keeps to one citation with the existing `Citation` shape
(`id`, `title`, `sourceUrl`, `capturedAt`, `quote`, `sectionPath`). `quote` must be a literal substring of that
passage's `text`; a marker with no matching passage is removed, as proposed in control room item 4.

## Not specified yet

- **Official chip documents** (Espressif datasheets and similar). The launch plan lists this as a third tool, but there
  is no stored chip-document corpus in the project today, so there is nothing to put a schema on. It needs an owner
  decision on which documents to ingest first.
- **Images / pinout diagrams** (pixel RAG, phase 4).
- **Transport**: how the harness reaches the website handlers (the D3/D4 relay) is the control room's contract.
