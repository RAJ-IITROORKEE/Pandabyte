import { listCatalogProducts } from "@/lib/catalog/published";
import { parseCatalogQuery } from "@/lib/catalog/query";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const parsed = parseCatalogQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return Response.json({
      error: { code: "validation_error", message: "Review the catalog filters and try again.", fields: parsed.fields },
    }, { status: 400, headers: HEADERS });
  }

  try {
    const { items, total } = await listCatalogProducts(parsed.value);
    return Response.json({ items, total, page: parsed.value.page, limit: parsed.value.limit }, { headers: HEADERS });
  } catch {
    return Response.json({
      error: { code: "catalog_unavailable", message: "The catalog is temporarily unavailable. Please try again later." },
    }, { status: 503, headers: HEADERS });
  }
}
