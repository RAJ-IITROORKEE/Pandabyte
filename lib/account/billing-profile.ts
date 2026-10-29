export type BillingProfile = {
  version: number;
  businessName: string;
  contactEmail: string;
  gstin: string;
};

export type BillingProfileInput = Omit<BillingProfile, "version"> & { expectedVersion: number };

function fields(value: unknown, versionKey: "version" | "expectedVersion") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const allowed = [versionKey, "businessName", "contactEmail", "gstin"];
  if (Object.keys(body).length !== allowed.length || Object.keys(body).some(key => !allowed.includes(key))) return null;
  if (!Number.isSafeInteger(body[versionKey]) || Number(body[versionKey]) < 0 || Number(body[versionKey]) > Number.MAX_SAFE_INTEGER - (versionKey === "expectedVersion" ? 1 : 0)) return null;
  for (const [key, maximum] of [["businessName", 160], ["contactEmail", 254], ["gstin", 15]] as const) {
    if (typeof body[key] !== "string" || Array.from(body[key]).length > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(body[key])) return null;
  }
  const businessName = (body.businessName as string).trim();
  const contactEmail = (body.contactEmail as string).trim();
  const gstin = (body.gstin as string).trim().toUpperCase();
  if ((contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail)) || (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/u.test(gstin))) return null;
  return { number: Number(body[versionKey]), businessName, contactEmail, gstin };
}

export function parseBillingProfileInput(value: unknown): BillingProfileInput | null {
  const parsed = fields(value, "expectedVersion");
  return parsed ? { expectedVersion: parsed.number, businessName: parsed.businessName, contactEmail: parsed.contactEmail, gstin: parsed.gstin } : null;
}

export function parseBillingProfile(value: unknown): BillingProfile | null {
  const parsed = fields(value, "version");
  return parsed ? { version: parsed.number, businessName: parsed.businessName, contactEmail: parsed.contactEmail, gstin: parsed.gstin } : null;
}
