import assert from "node:assert/strict";
import test from "node:test";
import { editorialPageNumber, editorialSearchQuery, youtubeVideoId } from "../components/editorial/public-utils.ts";
import { parseDocument } from "../lib/admin/validation.ts";

test("YouTube parser accepts only secure approved hosts and exact video IDs", () => {
  assert.equal(youtubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeVideoId("http://youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoId("https://youtube.com.attacker.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoId("https://attacker.example@youtube.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoId("https://youtube.com:8443/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoId("https://youtube.com/watch?v=short"), null);
  assert.equal(youtubeVideoId("javascript:alert(1)"), null);
});

test("Admin and public video parsing agree on exact paths and query ambiguity", () => {
  const id = "dQw4w9WgXcQ";
  const cases = [
    [id, id],
    [`https://www.youtu.be/${id}/?t=1`, id],
    [`HTTPS://M.YOUTUBE.COM:443/watch/?v=${id}&t=1`, id],
    [`https://youtube.com/watch?%76=dQw4w9WgXc%51`, id],
    [`https://youtube.com/embed/${id}?v=AAAAAAAAAAA`, id],
    [`https://youtube.com/shorts/${id}/`, id],
    [`https://youtube-nocookie.com/live/${id}#part`, id],
    [`https://youtube.com/watch?v=${id}&v=${id}`, null],
    [`https://youtube.com/embed/${id}?v=${id}&%76=${id}`, null],
    [`https://youtube.com/anything?v=${id}`, null],
    [`https://youtube.com/embed/${id}/extra`, null],
    [`https://youtu.be/${id}/extra`, null],
    [`https://youtube.com/a/../watch?v=${id}`, null],
    [`https://youtube.com/%77atch?v=${id}`, null],
    [`https://youtube.com:8443/watch?v=${id}`, null],
    [`https://youtube.com@attacker.example/watch?v=${id}`, null],
    [`https://youtube.com/watch?v=${id}\\extra`, null],
  ];
  const common = { title: "Video", slug: "video", summary: "", blocks: [], seoTitle: "", seoDescription: "", productIds: [], position: 0 };
  for (const [url, expected] of cases) {
    assert.equal(youtubeVideoId(url), expected, url);
    const result = parseDocument("videos", { ...common, url });
    assert.equal(result.ok, expected !== null, url);
    if (result.ok) assert.equal(result.value.url, url);
  }
});

test("editorial query and pagination stay bounded", () => {
  assert.equal(editorialSearchQuery("  sensors  "), "sensors");
  assert.equal(editorialSearchQuery("x".repeat(121)), "");
  assert.equal(editorialSearchQuery("bad\u0000query"), "");
  assert.equal(editorialPageNumber("3", 12), 3);
  assert.equal(editorialPageNumber("834", 12), 834);
  assert.equal(editorialPageNumber("835", 12), 1);
  assert.equal(editorialPageNumber("0", 12), 1);
  assert.equal(editorialPageNumber("1e3", 12), 1);
});
