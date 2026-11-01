export type AccountRow = { userId: string; name: string | null; email: string | null; imageUrl: string | null; verified: boolean; removalPending: boolean; role: string; version: number; protected: boolean; updatedAt: string | null; createdAt: string | null; lastActiveAt: string | null; orderCount: number };
export type SortKey = "account" | "role" | "orders" | "updated";
export function roleTone(role: string): string {
  if (role === "ADMIN") return "red";
  if (role === "CUSTOMER") return "neutral";
  if (role === "CATALOG") return "blue";
  if (role === "EDITOR") return "green";
  if (role === "SUPPORT") return "amber";
  let hash = 0;
  for (const char of role) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ["blue", "green", "amber", "violet"][hash % 4];
}
export function pageRows(items: AccountRow[], role: string, verification: string, sort: SortKey, descending: boolean, roleName: (key: string) => string): AccountRow[] {
  return items.filter((item) => (role === "all" || item.role === role) && (verification === "all" || item.verified === (verification === "verified"))).slice().sort((a, b) => {
    const comparison = sort === "orders" ? a.orderCount - b.orderCount : sort === "updated" ? (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") : sort === "role" ? roleName(a.role).localeCompare(roleName(b.role)) : (a.name || a.email || "").localeCompare(b.name || b.email || "");
    return (descending ? -comparison : comparison) || a.userId.localeCompare(b.userId);
  });
}
function csvCell(value: string | number): string {
  const text = String(value);
  // Spreadsheet programs interpret leading formula characters even in quoted CSV cells.
  const safe = /^[\s\u0000-\u001f]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function accountsCsv(items: AccountRow[], roleName: (key: string) => string): string {
  return [["Name", "Email", "Verification", "Role", "Orders", "Updated"], ...items.map((item) => [item.name ?? "", item.email ?? "", item.verified ? "Verified" : "Unverified", roleName(item.role), item.orderCount, item.updatedAt ?? ""])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
