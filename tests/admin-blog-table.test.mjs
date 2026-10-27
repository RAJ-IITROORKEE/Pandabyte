import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isBlogTableResult, parseContentTableQuery } from "../lib/admin/pages-table-contract.ts";

test("Blog table uses the bounded content-table query contract", () => {
  assert.deepEqual(parseContentTableQuery(new URLSearchParams("q=%20notes%20&status=draft&sort=title_desc&limit=10&offset=20")), {
    ok: true,
    value: { q: "notes", status: "draft", sort: "title_desc", limit: 10, offset: 20 },
  });
});

test("Blog table accepts its exact generic list DTO and rejects other content kinds", () => {
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "blog", title: "Notes", slug: "notes", version: 2,
    publishedRevisionId: null, archived: false, updatedAt: "2026-10-27T00:00:00.000Z",
  };
  assert.equal(isBlogTableResult({ items: [item], total: 1 }, 10), true);
  assert.equal(isBlogTableResult({ items: [{ ...item, kind: "page" }], total: 1 }, 10), false);
  assert.equal(isBlogTableResult({ items: [{ ...item, extra: true }], total: 1 }, 10), false);
  assert.equal(isBlogTableResult({ items: [item, item], total: 2 }, 1), false);
});

test("Blog table RPC remains read-only and restricted to content.edit and blog records", async () => {
  const sql = await readFile(new URL("../migrations/20261027173003_admin-blog-table.sql", import.meta.url), "utf8");
  assert.match(sql, /admin_assert_capability\('content\.edit'\)/);
  assert.match(sql, /WHERE r\.kind = 'blog'/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_list_blog_table\([^;]+FROM PUBLIC, anon, authenticated;/s);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_list_blog_table\([^;]+TO authenticated;/s);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});
