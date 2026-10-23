export type CustomerAddressInput = {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
};

export type CustomerAddress = CustomerAddressInput & {
  id: string;
  version: number;
};

export type CustomerAddressUpdate = CustomerAddressInput & {
  expectedVersion: number;
};

export type CustomerAddressDelete = { expectedVersion: number };

const ADDRESS_FIELDS = [
  "label",
  "recipientName",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "postalCode",
  "country",
  "isDefaultShipping",
  "isDefaultBilling",
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function parseText(
  value: unknown,
  maximum: number,
  required: boolean,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const length = Array.from(normalized).length;
  if (length > maximum || (required && length === 0) || CONTROL_CHARACTERS.test(normalized)) return null;
  return normalized;
}

function parseEditableAddress(value: unknown): CustomerAddressInput | null {
  if (!isObject(value) || !hasExactKeys(value, ADDRESS_FIELDS)) return null;

  const label = parseText(value.label, 40, true);
  const recipientName = parseText(value.recipientName, 120, true);
  const phone = parseText(value.phone, 48, false);
  const line1 = parseText(value.line1, 200, true);
  const line2 = parseText(value.line2, 200, false);
  const city = parseText(value.city, 100, true);
  const state = parseText(value.state, 100, true);
  const postalCode = parseText(value.postalCode, 24, true);
  const country = parseText(value.country, 2, true)?.toUpperCase() ?? null;

  if (
    label === null || recipientName === null || phone === null || line1 === null ||
    line2 === null || city === null || state === null || postalCode === null ||
    country === null || !/^[A-Z]{2}$/u.test(country) ||
    typeof value.isDefaultShipping !== "boolean" || typeof value.isDefaultBilling !== "boolean"
  ) {
    return null;
  }

  return {
    label,
    recipientName,
    phone,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
    isDefaultShipping: value.isDefaultShipping,
    isDefaultBilling: value.isDefaultBilling,
  };
}

export function parseCustomerAddressCreate(value: unknown): CustomerAddressInput | null {
  return parseEditableAddress(value);
}

export function parseCustomerAddressUpdate(value: unknown): CustomerAddressUpdate | null {
  if (!isObject(value) || !hasExactKeys(value, [...ADDRESS_FIELDS, "expectedVersion"])) return null;
  if (!Number.isSafeInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) return null;

  const address = parseEditableAddress(Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, value[field]])));
  return address ? { ...address, expectedVersion: value.expectedVersion as number } : null;
}

export function parseCustomerAddressDelete(value: unknown): CustomerAddressDelete | null {
  if (!isObject(value) || !hasExactKeys(value, ["expectedVersion"])) return null;
  return Number.isSafeInteger(value.expectedVersion) && (value.expectedVersion as number) >= 1
    ? { expectedVersion: value.expectedVersion as number }
    : null;
}

export function isCustomerAddressId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
