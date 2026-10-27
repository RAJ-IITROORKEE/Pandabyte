import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isContentTableItem, isContentTableResult, parseContentTableQuery } from "../lib/admin/pages-table-contract.ts";

test("FAQ table accepts bounded filters and uses the content table query contract", () => {
  assert.deepEqual(parseContentTableQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parseContentTableQuery(new URLSearchParams("q=%20shipping%20&status=published&sort=title_asc&limit=50&offset=10000")), {
    ok: true,
    value: { q: "shipping", status: "published", sort: "title_asc", limit: 50, offset: 10000 },
  });
  for (const query of ["status=unknown", "sort=random", "limit=15", "offset=10001", "q=%00", "q=%C2%85", "extra=1"]) {
    assert.equal(parseContentTableQuery(new URLSearchParams(query)).ok, false, query);
  }
});

test("FAQ table accepts only the exact FAQ list DTO", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "faq", title: "Shipping", slug: "shipping", version: 2,
    publishedRevisionId: null, archived: false, updatedAt: "2026-10-27T00:00:00.000Z",
  };
  assert.equal(isContentTableItem(item, "faq"), true);
  assert.equal(isContentTableResult({ items: [item], total: 1 }, 10, "faq"), true);
  for (const invalid of [
    { ...item, id: "bad" }, { ...item, kind: "page" }, { ...item, title: "" }, { ...item, version: 0 },
    { ...item, publishedRevisionId: "bad" }, { ...item, archived: 1 }, { ...item, updatedAt: "yesterday" },
    { ...item, extra: true },
  ]) assert.equal(isContentTableItem(invalid, "faq"), false);
  assert.equal(isContentTableResult({ items: [item], total: 0 }, 10, "faq"), false);
  assert.equal(isContentTableResult({ items: [item, item], total: 2 }, 1, "faq"), false);
});

test("FAQ table endpoint and RPC remain read-only and require content.edit", async () => {
  const route = await readFile(new URL("../app/api/admin/faqs/table/route.ts", import.meta.url), "utf8");
  const endpoint = await readFile(new URL("../lib/admin/faq-table.ts", import.meta.url), "utf8");
  const sql = await readFile(new URL("../migrations/20261027173004_admin-faq-table.sql", import.meta.url), "utf8");
  assert.match(route, /adminListFaqTable\(request\)/);
  assert.match(endpoint, /authorizedStaffClient\(\["content\.edit"\]\)/);
  assert.match(endpoint, /parseFaqTableQuery\(new URL\(request\.url\)\.searchParams\)/);
  assert.match(endpoint, /rpc\("admin_list_faq_table"/);
  assert.match(endpoint, /isContentTableResult\(result\.data, query\.value\.limit, "faq"\)/);
  assert.match(endpoint, /Cache-Control": "private, no-store"/);
  assert.match(sql, /admin_assert_capability\('content\.edit'\)/);
  assert.match(sql, /WHERE r\.kind = 'faq'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_faq_table\([^;]+FROM PUBLIC, anon, authenticated;/s);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_faq_table\([^;]+TO authenticated;/s);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});
