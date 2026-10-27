import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseLearnTableQuery } from "../lib/admin/learn-table-contract.ts";
import { isContentTableItem, isContentTableResult, parseContentTableQuery } from "../lib/admin/pages-table-contract.ts";

test("Learn table accepts bounded filters and uses the content table query contract", () => {
  assert.deepEqual(parseContentTableQuery(new URLSearchParams()), {
    ok: true,
    value: { q: "", status: "all", sort: "updated_desc", limit: 20, offset: 0 },
  });
  assert.deepEqual(parseContentTableQuery(new URLSearchParams("q=%20manual%20&status=published&sort=title_asc&limit=50&offset=10000")), {
    ok: true,
    value: { q: "manual", status: "published", sort: "title_asc", limit: 50, offset: 10000 },
  });
  for (const query of ["status=unknown", "sort=random", "limit=15", "offset=10001", "q=%00", "q=%C2%85", "extra=1"]) {
    assert.equal(parseContentTableQuery(new URLSearchParams(query)).ok, false, query);
  }
});


test("Learn collection filter validates values and duplicates", () => {
  assert.equal(parseLearnTableQuery(new URLSearchParams()).value.collection, "all");
  for (const collection of ["all", "product-specs", "embedded-systems", "kit-guides"]) {
    assert.equal(parseLearnTableQuery(new URLSearchParams({ collection })).value.collection, collection);
  }
  for (const query of ["collection=unknown", "collection=", "collection=all&collection=kit-guides", "collection=all&extra=1"]) {
    assert.equal(parseLearnTableQuery(new URLSearchParams(query)).ok, false, query);
  }
});
test("Learn table accepts only the exact resource list DTO", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "resource", title: "Board guide", slug: "board-guide", version: 2,
    publishedRevisionId: null, archived: false, updatedAt: "2026-10-27T00:00:00.000Z",
  };
  assert.equal(isContentTableItem(item, "resource"), true);
  assert.equal(isContentTableResult({ items: [item], total: 1 }, 10, "resource"), true);
  for (const invalid of [
    { ...item, id: "bad" }, { ...item, kind: "solution" }, { ...item, title: "" }, { ...item, version: 0 },
    { ...item, publishedRevisionId: "bad" }, { ...item, archived: 1 }, { ...item, updatedAt: "yesterday" },
    { ...item, extra: true },
  ]) assert.equal(isContentTableItem(invalid, "resource"), false);
  assert.equal(isContentTableResult({ items: [item], total: 0 }, 10, "resource"), false);
  assert.equal(isContentTableResult({ items: [item, item], total: 2 }, 1, "resource"), false);
});

test("Learn table endpoint and RPC remain read-only and require content.edit", async () => {
  const route = await readFile(new URL("../app/api/admin/learn/table/route.ts", import.meta.url), "utf8");
  const endpoint = await readFile(new URL("../lib/admin/learn-table.ts", import.meta.url), "utf8");
  const sql = await readFile(new URL("../migrations/20261027173011_admin-learn-collection-filter.sql", import.meta.url), "utf8");
  assert.match(route, /adminListLearnTable\(request\)/);
  assert.match(endpoint, /authorizedStaffClient\(\["content\.edit"\]\)/);
  assert.match(endpoint, /parseLearnTableQuery\(new URL\(request\.url\)\.searchParams\)/);
  assert.match(endpoint, /rpc\("admin_list_learn_table"/);
  assert.match(endpoint, /isContentTableResult\(result\.data, query\.value\.limit, "resource"\)/);
  assert.match(endpoint, /Cache-Control": "private, no-store"/);
  assert.match(sql, /admin_assert_capability\('content\.edit'\)/);
  assert.match(endpoint, /p_collection: query\.value\.collection/);
  assert.match(sql, /COALESCE\(r\.draft->>'collection', 'embedded-systems'\)/);
  assert.match(sql, /p_collection = 'all' OR r\.collection = p_collection/);
  assert.match(sql, /WHERE r\.kind = 'resource'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_learn_table\([^;]+FROM PUBLIC, anon, authenticated;/s);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_learn_table\([^;]+TO authenticated;/s);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

