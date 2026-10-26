import assert from "node:assert/strict";
import test from "node:test";
import { clampSidebarWidth, readSidebarLayout, sidebarMode } from "./sidebar-layout.ts";

test("layout preferences reject corruption and stale versions and only keep layout fields", () => {
  for (const raw of [null, "{", "null", "[]", '{"version":2,"width":350}']) {
    assert.deepEqual(readSidebarLayout(raw), { version: 1, width: 256, collapsed: false, closedGroups: [] });
  }
  assert.deepEqual(readSidebarLayout(JSON.stringify({ version: 1, width: 999, collapsed: true, closedGroups: ["Assets", "unknown", "Assets"], role: "ADMIN" })), {
    version: 1, width: 360, collapsed: true, closedGroups: ["Assets"],
  });
  for (const width of [null, "350", NaN, Infinity]) assert.equal(clampSidebarWidth(width), 256);
  assert.equal(clampSidebarWidth(-2), 224);
  assert.equal(clampSidebarWidth(250.7), 251);
});

test("narrow screens ignore stored expansion and desktop widths remain bounded", () => {
  assert.equal(sidebarMode(320, false), "drawer");
  assert.equal(sidebarMode(767, true), "drawer");
  for (const collapsed of [true, false]) {
    assert.equal(sidebarMode(768, collapsed), "rail");
    assert.equal(sidebarMode(1023, collapsed), "rail");
  }
  assert.equal(sidebarMode(1024, false), "expanded");
  assert.equal(sidebarMode(1440, true), "rail");
});
