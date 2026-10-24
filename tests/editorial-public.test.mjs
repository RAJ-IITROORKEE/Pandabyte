import assert from "node:assert/strict";
import test from "node:test";
import { editorialPageNumber, editorialSearchQuery, youtubeVideoId } from "../components/editorial/public-utils.ts";

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
