import { isStaffRole, type StaffRole } from "./roles-validation.ts";

const full = ["read", "create", "update", "publish", "delete"] as const;
export const PERMISSION_CATALOG = [
  ...["products", "categories", "pages", "blog", "faqs", "team", "contact", "navigation", "solutions", "learn", "videos"].map((resource) => ({ resource, label: resource === "faqs" ? "FAQs" : resource[0].toUpperCase() + resource.slice(1), actions: full })),
  ...["inventory", "orders"].map((resource) => ({ resource, label: resource[0].toUpperCase() + resource.slice(1), actions: ["read", "update"] as readonly string[] })),
  { resource: "inquiries", label: "Inquiries", actions: ["read", "update", "delete"] as readonly string[] },
  { resource: "media", label: "Media", actions: ["read", "create", "update"] as readonly string[] },
];
export const PERMISSION_ACTION_LABELS: Record<string, string> = { read: "Read", create: "Create", update: "Update", publish: "Publish", delete: "Delete" };
const permissions = new Set(PERMISSION_CATALOG.flatMap(({ resource, actions }) => actions.map((action) => `${resource}.${action}`)));
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const keys = (x: Record<string, unknown>, fields: string[]) => Object.keys(x).length === fields.length && fields.every((k) => Object.hasOwn(x, k));
const integer = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const clean = (x: unknown, max: number, required = true): x is string => typeof x === "string" && x === x.trim() && x.length <= max && (!required || x.length > 0) && !/[\u0000-\u001f\u007f]/.test(x);
export type RoleDefinition = { key: StaffRole; name: string; description: string; permissions: string[]; version: number; builtIn: boolean; memberCount: number };
export type RoleDefinitionInput = { key: string | null; name: string; description: string; permissions: string[]; expectedVersion: number; reason: string };
export function validPermissions(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > permissions.size || value.some((p) => typeof p !== "string" || !permissions.has(p)) || new Set(value).size !== value.length) return false;
  const selected = new Set(value);
  return value.every((p: string) => { const [resource, action] = p.split("."); return (action === "read" || selected.has(`${resource}.read`)) && (!['publish', 'delete'].includes(action) || selected.has(`${resource}.update`)); });
}
export function parseRoleDefinitionInput(value: unknown): RoleDefinitionInput | null {
  if (!object(value) || !keys(value, ["key", "name", "description", "permissions", "expectedVersion", "reason"]) || !(value.key === null || (typeof value.key === "string" && /^custom_[a-z0-9-]{3,48}$/.test(value.key))) || !clean(value.name, 100) || !clean(value.description, 500, false) || !validPermissions(value.permissions) || !integer(value.expectedVersion) || !clean(value.reason, 500) || (value.key === null ? value.expectedVersion !== 0 : value.expectedVersion === 0)) return null;
  return value as RoleDefinitionInput;
}
export function parseRoleDefinition(value: unknown): RoleDefinition | null {
  if (!object(value) || !keys(value, ["key", "name", "description", "permissions", "version", "builtIn", "memberCount"]) || !isStaffRole(value.key) || !clean(value.name, 100) || !clean(value.description, 500, false) || !validPermissions(value.permissions) || !integer(value.version) || value.version === 0 || typeof value.builtIn !== "boolean" || value.builtIn === value.key.startsWith("custom_") || !integer(value.memberCount)) return null;
  return value as RoleDefinition;
}
export function parseRoleCatalog(value: unknown): {items: RoleDefinition[]} | null {
  if (!object(value) || !keys(value, ["items"]) || !Array.isArray(value.items) || value.items.length > 500) return null;
  const items = value.items.map(parseRoleDefinition);
  return items.some((x) => !x) || new Set(items.map((x) => x?.key)).size !== items.length ? null : { items: items as RoleDefinition[] };
}
export type UserSummary = { userId: string; role: StaffRole; version: number; protected: boolean; updatedAt: string | null; orderCount: number; removalPending: boolean };
export type UserSummaries = { items: UserSummary[]; counts: { assigned: number; staff: number; byRole: {role: StaffRole; count: number}[]; staffUsers: {userId: string; role: StaffRole}[] } };
export function parseUserSummaries(value: unknown, ids: string[]): UserSummaries | null {
  if (!object(value) || !keys(value, ["items", "counts"]) || !Array.isArray(value.items) || !object(value.counts) || !keys(value.counts, ["assigned", "staff", "byRole", "staffUsers"]) || !integer(value.counts.assigned) || !integer(value.counts.staff) || value.counts.staff > value.counts.assigned || !Array.isArray(value.counts.byRole) || value.counts.byRole.length > 500 || !Array.isArray(value.counts.staffUsers) || value.counts.staffUsers.length > 100) return null;
  const valid = value.items.every((v: unknown) => object(v) && keys(v, ["userId", "role", "version", "protected", "updatedAt", "orderCount", "removalPending"]) && typeof v.userId === "string" && ids.includes(v.userId) && isStaffRole(v.role) && integer(v.version) && typeof v.protected === "boolean" && (!v.protected || v.role === "ADMIN") && (v.updatedAt === null || (typeof v.updatedAt === "string" && Number.isFinite(Date.parse(v.updatedAt)))) && integer(v.orderCount) && typeof v.removalPending === "boolean");
  if (!valid || value.items.length !== ids.length || new Set(value.items.map((v: UserSummary) => v.userId)).size !== ids.length || !value.counts.byRole.every((v: unknown) => object(v) && keys(v, ["role", "count"]) && isStaffRole(v.role) && integer(v.count))) return null;
  const staffUsers = value.counts.staffUsers;
  if (staffUsers.length !== value.counts.staff || !staffUsers.every((v: unknown) => object(v) && keys(v, ["userId", "role"]) && clean(v.userId, 256) && isStaffRole(v.role) && v.role !== "CUSTOMER") || new Set(staffUsers.map((v: {userId: string}) => v.userId)).size !== staffUsers.length) return null;
  return value as UserSummaries;
}
export function parseUsersQuery(url: string): {query: string; limit: number; offset: number} | null {
  let params: URLSearchParams; try { params = new URL(url).searchParams; } catch { return null; }
  if ([...params.keys()].some((k) => !["query", "limit", "offset"].includes(k)) || ["query", "limit", "offset"].some((k) => params.getAll(k).length > 1)) return null;
  const query = (params.get("query") ?? "").trim();
  const limit = params.get("limit") ?? "25", offset = params.get("offset") ?? "0";
  if (!clean(query, 100, false) || !/^(0|[1-9]\d*)$/.test(limit) || !/^(0|[1-9]\d*)$/.test(offset) || +limit < 1 || +limit > 50 || +offset > 5000) return null;
  return {query, limit: +limit, offset: +offset};
}



export function canAdminPermission(capabilities: readonly string[], resource: string, action: string): boolean {
  return !capabilities.includes("__custom_role__") || capabilities.includes(`${resource}.${action}`);
}

export function parseUserRemovalInput(value: unknown): {expectedVersion: number; reason: string} | null {
  if (!object(value) || !keys(value, ["expectedVersion", "reason"]) || !integer(value.expectedVersion) || !clean(value.reason, 500)) return null;
  return { expectedVersion: value.expectedVersion, reason: value.reason };
}
export function validUserId(value: unknown): value is string { return clean(value, 256); }
