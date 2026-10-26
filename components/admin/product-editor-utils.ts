export function productSlugFromTitle(title: string) {
  return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160).replace(/-+$/g, "");
}

export function parsePriceToPaise(value: string): number | null {
  const amount = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [rupees, fraction = ""] = amount.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise <= 10_000_000_000 ? paise : null;
}

export function priceInputFromPaise(paise: number | null) {
  return paise === null ? "" : (paise / 100).toFixed(2);
}

export function dateTimeInputFromUtc(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
    : "";
}

export function dateTimeInputToUtc(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
