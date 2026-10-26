# C2 catalog and product presentation

26 October 2026. New presentation files prepared for root integration; browser/type/build verification remains with root. This note does not claim a completed rendered review.

## Read and scope

Read the execution plan, current `/shop` and `/products/[slug]` pages, `PublicPage`, `ProductVariantPanel`, `ProductGallery`, `ProductCard`, catalog CSS, theme/global tokens, saved Catalog v9 and PandaPulse v9 HTML, Ponytail/UI/UX Pro Max, and installed Next CSS/server-component guides. The existing product page already passes `model3d` to the concurrent 3D gallery integration.

The three presentation gaps addressed are: product identity above rather than beside media; no contextual product breadcrumb; and a broad boxed filter rail plus sparse two-column desktop grid. Real product imagery and the right-column identity are the focus. The draft's invented commerce controls, hardcoded prices and category labels are not a data source.

Owned additions only:

- `components/catalog/product-overview.tsx`: server presentation component with typed title/summary and existing gallery/panel/details slots.
- `components/catalog/catalog-presentation.module.css`: product composition and additive catalog layout classes.
- This note.

No existing file, card/gallery internals, media URL, backend, package, design reference or 3D artifact was edited. No extra catalog wrapper component is necessary: one ordinary div scopes the additive CSS.

## Exact product integration

In `app/products/[slug]/page.tsx`, add:

```tsx
import { ProductOverview } from "@/components/catalog/product-overview";
```

Remove the catalog CSS import only if it becomes unused. Keep `PublicPage`/`EmptyState` for the existing upcoming branch. Replace only the final published-product return with:

```tsx
return <ProductOverview
  product={product}
  gallery={<ProductGallery key={product.id} images={images} model3d={product.document.model3d} title={product.title} />}
  panel={<ProductVariantPanel key={product.id} variants={product.variants} observation={product.document.sourceObservation} />}
>
  <ProductDetails product={product} />
</ProductOverview>;
```

This is one main landmark and one H1. Preserve the existing metadata, lookup, redirect/404, upcoming, image/alt construction and `dynamic` behavior. If concurrent gallery changes add props, carry those exact props forward. The existing variant panel remains the owner of selected SKU; it appears below the title/summary in the right column rather than being duplicated as an initially selected SKU that could become stale after a variant change. This is a deliberate content-state difference from the static draft's SKU-before-price row. The breadcrumb uses only real Home/Shop destinations and the actual product title; it does not infer a category.

## Exact catalog integration

Add this import to `app/shop/page.tsx`:

```tsx
import presentation from "@/components/catalog/catalog-presentation.module.css";
```

Inside the current `PublicPage`, wrap all existing children (category nav, validation errors and GET form) in `<div className={presentation.catalogPage}>…</div>`. Add these classes alongside the existing classes, keeping the original class in every case:

| Existing class | Additive class |
| --- | --- |
| `styles.categorySection` | `presentation.categorySection` |
| `styles.categoryCards` | `presentation.categoryCards` |
| `styles.catalogControls` | `presentation.controls` |
| `styles.searchForm` | `presentation.searchRow` |
| `styles.catalogLayout` | `presentation.layout` |
| `styles.filters` | `presentation.filters` |
| `styles.resultsHeader` | `presentation.resultsHeader` |
| `styles.productGrid` | `presentation.grid` |

For example: `className={`${styles.productGrid} ${presentation.grid}`}`. Scoped two-class selectors deliberately outrank the existing one-class layout rules without depending on CSS import order. Do not merge the style objects or replace the existing base classes: their validation, control, media and responsive styles remain necessary.

All form content, names/default values, category/query parsing, action/method, submit/reset links, sort options, hidden limit/page controls, redirects and pagination links stay byte-for-byte equivalent. Keep the existing native filter details/summary: it remains keyboard-operable and requires no new client state. Do not force it closed with CSS, hide its fields, or change current GET submission behavior. Existing checked checkboxes retain active state. Keep the actual invalid-query, empty and unavailable states.

## Root verification gates

Run the root type/lint/build checks and sequential built-in-browser comparisons. At 320/768/1024/1440px in both themes, check title/model strings wrap, breadcrumb has visible focus, gallery still contains full media, source observations remain non-purchasable with caveats, and the optional 3D controls remain accessible. Check exact SKU GET search, combined filters, reset, sort, pagination/back-forward, invalid inputs and empty results. At mobile widths, check native filter disclosure by keyboard. The new CSS adds no motion, client boundary, cache, media selector or image transformation.

No browser/server/test commands were run by this worker, as assigned. The primary remaining risk is rendered interaction between additive page classes and concurrent 3D card/gallery work; root integration and browser checks must resolve it before declaring C2 complete.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
