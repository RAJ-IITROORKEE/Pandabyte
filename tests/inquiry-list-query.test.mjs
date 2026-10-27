import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_INQUIRY_SORTS, ADMIN_INQUIRY_STATUSES, parseAdminInquiryListQuery } from "../lib/admin/inquiry-list-contract.ts";

test("inquiry list query keeps existing defaults and supports filters, sorting, and paging", () => {
  assert.deepEqual(parseAdminInquiryListQuery(new URLSearchParams()), {
    query: "", status: null, sort: "created_desc", limit: 25, offset: 0,
  });
  assert.deepEqual(parseAdminInquiryListQuery(new URLSearchParams(
    "q=%20board%20&status=in_progress&sort=name_asc&limit=50&offset=100",
  )), { query: "board", status: "in_progress", sort: "name_asc", limit: 50, offset: 100 });
  for (const status of ADMIN_INQUIRY_STATUSES) assert.equal(parseAdminInquiryListQuery(new URLSearchParams(`status=${status}`))?.status, status);
  for (const sort of ADMIN_INQUIRY_SORTS) assert.equal(parseAdminInquiryListQuery(new URLSearchParams(`sort=${sort}`))?.sort, sort);
  assert.equal(parseAdminInquiryListQuery(new URLSearchParams(`q=${"é".repeat(100)}`))?.query.length, 100);
  assert.deepEqual(parseAdminInquiryListQuery(new URLSearchParams("limit=1&offset=1000000")), {
    query: "", status: null, sort: "created_desc", limit: 1, offset: 1_000_000,
  });
});

test("inquiry list query rejects unknown, duplicate, control, malformed, and unbounded values", () => {
  for (const query of [
    "debug=1", "q=a&q=b", "status=paid", "sort=random", "limit=0", "limit=51", "limit=100", "offset=-1",
    "offset=1000001", `q=${"x".repeat(101)}`, "q=%0A", "q=%C2%85", "sort=name_asc&sort=created_desc",
  ]) assert.equal(parseAdminInquiryListQuery(new URLSearchParams(query)), null, query);
});
