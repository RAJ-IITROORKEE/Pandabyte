import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { validateProductDocx, DOCX_MIME } from "../lib/editorial/docx-validation.ts";
import { prepareEditorialFile } from "../lib/editorial/media.ts";
import { prepareEditorialDownload } from "../lib/editorial/media-delivery.ts";

async function word(extra = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Product documentation</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Pin A1</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  for (const [name, content] of Object.entries(extra)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
test("DOCX upload and delivery preserve exact validated original bytes", async () => {
  const bytes = await word();
  const proof = await validateProductDocx(bytes);
  assert.ok(proof);
  const upload = await prepareEditorialFile(new File([bytes], "Product manual.docx", { type: DOCX_MIME }));
  assert.ok(upload?.document);
  assert.deepEqual(upload.bytes, bytes);
  const media = { mimeType: DOCX_MIME, byteSize: bytes.length, width: null, height: null, documentSha256: proof.sha256 };
  assert.deepEqual((await prepareEditorialDownload(bytes, media)).bytes, bytes);
  assert.equal(await prepareEditorialDownload(bytes, media, 960), null);
  assert.equal(await prepareEditorialDownload(bytes, { ...media, documentSha256: "0".repeat(64) }), null);
});
test("DOCX rejects macros, HTML, external resources, XML entities and expansion bombs", async () => {
  const rel = target => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="${target}"/></Relationships>`;
  for (const extra of [
    { "word/vbaProject.bin": "macro" },
    { "word/chunk.html": "<script>alert(1)</script>" },
    { "word/_rels/document.xml.rels": rel("https://external.invalid/track.png") },
    { "word/document.xml": '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><foo>&x;</foo>' },
    { "word/large.xml": "x".repeat(9 * 1024 * 1024) },
  ]) assert.equal(await validateProductDocx(await word(extra)), null);
  assert.equal(await validateProductDocx(Buffer.from("not a zip")), null);
});

export { word as productDocxFixture };
