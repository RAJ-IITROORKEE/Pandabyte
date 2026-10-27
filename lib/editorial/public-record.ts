import { ADMIN_MODULES, parseDocument, parseRecordId, type AdminDocument, type AdminModule } from "../admin/validation.ts";

export type PublicVariant = {
  id: string; sku: string; label: string; regularPricePaise: number | null; effectivePricePaise: number | null;
  isOnSale: boolean; saleEndsAt: string | null; availability: "available" | "unavailable"; purchasable?: boolean; cartEligible?: boolean;
};
export type PublishedRecord<M extends AdminModule = AdminModule> = {
  id: string; title: string; slug: string; summary: string; document: AdminDocument<M>;
  variants: PublicVariant[]; publishedAt: string; revisionId: string;
};

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
const paise = (value: unknown): value is number | null => value === null || (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000_000);
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

export function parsePublicVariant(value: unknown): PublicVariant {
  if (!object(value) || typeof value.id !== "string" || !parseRecordId(value.id) ||
    typeof value.sku !== "string" || !value.sku.trim() || value.sku.length > 80 ||
    typeof value.label !== "string" || !value.label.trim() || value.label.length > 120 ||
    !paise(value.regularPricePaise) || !paise(value.effectivePricePaise) || typeof value.isOnSale !== "boolean" ||
    !(value.saleEndsAt === null || date(value.saleEndsAt)) || !["available", "unavailable"].includes(String(value.availability)) ||
    ("cartEligible" in value && typeof value.cartEligible !== "boolean") ||
    (value.cartEligible === true && (value.effectivePricePaise === null || value.availability !== "unavailable")) ||
    (value.effectivePricePaise !== null && (value.regularPricePaise === null || value.effectivePricePaise > value.regularPricePaise)) ||
    (value.isOnSale && (value.effectivePricePaise === null || (value.saleEndsAt === null && (value.regularPricePaise === null || value.effectivePricePaise >= value.regularPricePaise)))) ||
    (!value.isOnSale && (value.saleEndsAt !== null || value.effectivePricePaise !== value.regularPricePaise))) throw new Error("Published pricing could not be rendered.");
  return { id: value.id, sku: value.sku, label: value.label, regularPricePaise: value.regularPricePaise,
    effectivePricePaise: value.effectivePricePaise, isOnSale: value.isOnSale, saleEndsAt: value.saleEndsAt,
    availability: value.availability as PublicVariant["availability"],
    ...("cartEligible" in value ? { cartEligible: value.cartEligible as boolean } : {}) };
}

export function parsePublishedRecord<M extends AdminModule>(module: M, value: unknown): PublishedRecord<M> {
  if (!object(value) || value.kind !== ADMIN_MODULES[module].kind || typeof value.id !== "string" || !parseRecordId(value.id) ||
    typeof value.revisionId !== "string" || !parseRecordId(value.revisionId) || !date(value.publishedAt)) throw new Error("Published content could not be rendered.");
  if ("sourceReview" in value || (object(value.document) && "sourceReview" in value.document)) throw new Error("Published content could not be rendered.");
  const parsed = parseDocument(module, value.document);
  if (!parsed.ok) throw new Error("Published content could not be rendered.");
  if (module === "products" && (!Array.isArray(value.variants) || value.variants.length > 100)) throw new Error("Published pricing could not be rendered.");
  const sourceObservation = module === "products" && "sourceObservation" in parsed.value;
  const variants = module === "products" ? (value.variants as unknown[]).map((variant) => {
    const parsedVariant = parsePublicVariant(variant);
    return sourceObservation ? { ...parsedVariant, purchasable: false } : parsedVariant;
  }) : [];
  return { id: value.id, title: parsed.value.title, slug: parsed.value.slug, summary: parsed.value.summary,
    document: parsed.value, variants, publishedAt: value.publishedAt, revisionId: value.revisionId };
}
