import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isContentTableItem, isContentTableResult, parseContentTableQuery } from "../lib/admin/pages-table-contract.ts";

test("Solutions table accepts bounded filters and uses the content table query contract", () => {
  assert.deepEqual(parseContentTableQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parseContentTableQuery(new URLSearchParams("q=%20embedded%20&status=published&sort=title_asc&limit=50&offset=10000")), {
    ok: true,
    value: { q: "embedded", status: "published", sort: "title_asc", limit: 50, offset: 10000 },
  });
  for (const query of ["status=unknown", "sort=random", "limit=15", "offset=10001", "q=%00", "q=%C2%85", "extra=1"]) {
    assert.equal(parseContentTableQuery(new URLSearchParams(query)).ok, false, query);
  }
});

test("Solutions table accepts only the exact solution list DTO", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "solution", title: "Embedded systems", slug: "embedded-systems", version: 2,
    publishedRevisionId: null, archived: false, updatedAt: "2026-10-27T00:00:00.000Z",
  };
  assert.equal(isContentTableItem(item, "solution"), true);
  assert.equal(isContentTableResult({ items: [item], total: 1 }, 10, "solution"), true);
  for (const invalid of [
    { ...item, id: "bad" }, { ...item, kind: "team" }, { ...item, title: "" }, { ...item, version: 0 },
    { ...item, publishedRevisionId: "bad" }, { ...item, archived: 1 }, { ...item, updatedAt: "yesterday" },
    { ...item, extra: true },
  ]) assert.equal(isContentTableItem(invalid, "solution"), false);
  assert.equal(isContentTableResult({ items: [item], total: 0 }, 10, "solution"), false);
  assert.equal(isContentTableResult({ items: [item, item], total: 2 }, 1, "solution"), false);
});

test("Solutions table endpoint and RPC remain read-only and require content.edit", async () => {
  const route = await readFile(new URL("../app/api/admin/solutions/table/route.ts", import.meta.url), "utf8");
  const endpoint = await readFile(new URL("../lib/admin/solutions-table.ts", import.meta.url), "utf8");
  const sql = await readFile(new URL("../migrations/20261027173006_admin-solutions-table.sql", import.meta.url), "utf8");
  assert.match(route, /adminListSolutionsTable\(request\)/);
  assert.match(endpoint, /authorizedStaffClient\(\["content\.edit"\]\)/);
  assert.match(endpoint, /parseSolutionsTableQuery\(new URL\(request\.url\)\.searchParams\)/);
  assert.match(endpoint, /rpc\("admin_list_solutions_table"/);
  assert.match(endpoint, /isContentTableResult\(result\.data, query\.value\.limit, "solution"\)/);
  assert.match(endpoint, /Cache-Control": "private, no-store"/);
  assert.match(sql, /admin_assert_capability\('content\.edit'\)/);
  assert.match(sql, /WHERE r\.kind = 'solution'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_solutions_table\([^;]+FROM PUBLIC, anon, authenticated;/s);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_solutions_table\([^;]+TO authenticated;/s);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});
