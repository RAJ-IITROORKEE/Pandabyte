export const STAFF_ROLES = ["ADMIN", "EDITOR", "CATALOG", "SUPPORT", "CUSTOMER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type StaffRoleMembership = {
  userId: string;
  role: StaffRole;
  version: number;
  protected: boolean;
  updatedAt: string;
};

export type StaffRoleList = { items: StaffRoleMembership[]; total: number };
export type StaffRoleChange = {
  email: string;
  role: StaffRole;
  expectedVersion: number;
  reason: string;
  targetUserId: string | null;
};
export type StaffRoleListQuery = { limit: number; offset: number };

const ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const ROLE_CHANGE_FIELDS = ["email", "role", "expectedVersion", "reason", "targetUserId"];
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function parseBoundedInteger(value: unknown, min: number, max: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
    ? value as number
    : null;
}

function isTimestamp(value: string): boolean {
  const match = TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, y, m, d, h, minute, second, offsetHour, offsetMinute] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1] &&
    Number(h) <= 23 && Number(minute) <= 59 && Number(second) <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59));
}

export function parseRoleListQuery(url: string): StaffRoleListQuery | null {
  let params: URLSearchParams;
  try { params = new URL(url).searchParams; } catch { return null; }
  if ([...params.keys()].some((key) => !["limit", "offset"].includes(key)) ||
      params.getAll("limit").length > 1 || params.getAll("offset").length > 1) return null;

  const parseParam = (name: string, fallback: number, max: number) => {
    if (!params.has(name)) return fallback;
    const raw = params.get(name) ?? "";
    if (!/^(0|[1-9]\d*)$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value <= max ? value : null;
  };
  const limit = parseParam("limit", 25, 50);
  const offset = parseParam("offset", 0, 5000);
  return limit !== null && limit >= 1 && offset !== null ? { limit, offset } : null;
}

export function parseRoleChangeInput(value: unknown): StaffRoleChange | null {
  if (!isObject(value) || !hasOnlyKeys(value, ROLE_CHANGE_FIELDS) ||
      ROLE_CHANGE_FIELDS.some((field) => !Object.hasOwn(value, field))) return null;

  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const role = typeof value.role === "string" && ROLE_SET.has(value.role) ? value.role as StaffRole : null;
  const expectedVersion = parseBoundedInteger(value.expectedVersion, 0, Number.MAX_SAFE_INTEGER - 1);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const targetUserId = value.targetUserId;
  const validEmail = email.length <= 254 && !CONTROL_CHARS.test(email) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validReason = reason.length > 0 && reason.length <= 500 && !CONTROL_CHARS.test(reason);
  const validTarget = targetUserId === null || (typeof targetUserId === "string" &&
    targetUserId.length > 0 && targetUserId.length <= 256 &&
    targetUserId === targetUserId.trim() && !CONTROL_CHARS.test(targetUserId));

  if (!validEmail || !role || expectedVersion === null || !validReason || !validTarget ||
      (targetUserId === null ? expectedVersion !== 0 : expectedVersion === 0)) return null;
  return { email, role, expectedVersion, reason, targetUserId: targetUserId as string | null };
}

export function parseStaffRoleMembership(value: unknown): StaffRoleMembership | null {
  if (!isObject(value) || !hasOnlyKeys(value, ["userId", "role", "version", "protected", "updatedAt"])) return null;
  const { userId, role, version, protected: isProtected, updatedAt } = value;
  if (typeof userId !== "string" || !userId || userId.length > 256 || userId !== userId.trim() || CONTROL_CHARS.test(userId) ||
      typeof role !== "string" || !ROLE_SET.has(role) || parseBoundedInteger(version, 1, Number.MAX_SAFE_INTEGER) === null ||
      typeof isProtected !== "boolean" || (isProtected && role !== "ADMIN") || typeof updatedAt !== "string" ||
      !isTimestamp(updatedAt)) return null;
  return { userId, role: role as StaffRole, version: version as number, protected: isProtected, updatedAt };
}

export function parseStaffRoleList(value: unknown): StaffRoleList | null {
  if (!isObject(value) || !hasOnlyKeys(value, ["items", "total"]) || !Array.isArray(value.items) ||
      value.items.length > 50 || parseBoundedInteger(value.total, 0, Number.MAX_SAFE_INTEGER) === null) return null;
  const items = value.items.map(parseStaffRoleMembership);
  if (items.some((item) => item === null) || (value.total as number) < items.length || new Set(items.map((item) => item?.userId)).size !== items.length) return null;
  return { items: items as StaffRoleMembership[], total: value.total as number };
}
