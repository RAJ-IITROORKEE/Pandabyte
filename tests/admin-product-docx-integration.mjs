import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@insforge/sdk";
import JSZip from "jszip";
import {
  appRequest,
  ensure,
  preflight,
  safeJson,
  verifyFixtureOwnership,
} from "./phase2-isolation.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, ".bootstrap", "admin-product-integration-fixtures.json");
const previewPath = path.join(projectRoot, ".bootstrap", "admin-products", "preview.json");
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MEDIA_BUCKET = "editorial-media";

class HarnessFailure extends Error {
  constructor(label) {
    super(label);
    this.name = "HarnessFailure";
    this.label = label;
  }
}

function safeFailureLabel(error) {
  const name = typeof error?.name === "string" ? error.name.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40) || "Error" : "Error";
  const location = typeof error?.stack === "string" ? error.stack.match(/admin-product-docx-integration\.mjs:(\d+):(\d+)/) : null;
  return location ? `admin_product_docx_integration_${name}_at_${location[1]}` : "admin_product_docx_integration_failed";
}

async function rpc(client, name, args) {
  try {
    return await client.database.schema("public").rpc(name, args);
  } catch {
    return { data: null, error: true };
  }
}

function request(context, route, token, options = {}) {
  return appRequest(context.appOrigin, route, token, options);
}

async function responseJson(response, status, label) {
  ensure(response.status === status, `${label}_status_${response.status}`);
  return safeJson(response, `${label}_json`);
}

function richText(text, href) {
  const node = { type: "text", text };
  if (href) node.marks = [{ type: "link", attrs: { href } }];
  return { type: "doc", content: [{ type: "paragraph", content: [node] }] };
}

async function docxFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Private disposable product manual</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Fixture part A1</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function writePreviewMarker(marker, mediaId) {
  ensure(marker && /^[0-9a-f-]{36}$/i.test(marker.runId) && /^[0-9a-f-]{36}$/i.test(marker.productId), "preview_marker_invalid");
  ensure(/^[0-9a-f-]{36}$/i.test(mediaId), "docx_media_id_invalid");
  await mkdir(path.dirname(previewPath), { recursive: true });
  await writeFile(previewPath, `${JSON.stringify({ runId: marker.runId, productId: marker.productId, docxMediaId: mediaId }, null, 2)}\n`, "utf8");
}

async function main() {
  let context;
  try { context = await preflight(); }
  catch (error) {
    console.error(`Product DOCX integration preflight stopped safely: ${error?.label ?? "preflight_failed"}.`);
    process.exitCode = 2;
    return;
  }

  let state, marker, staff, staffClient, mediaManageGranted = false, failure = null;
  try {
    state = JSON.parse(await readFile(fixturePath, "utf8"));
    marker = JSON.parse(await readFile(previewPath, "utf8"));
    ensure(state && state.runId === marker?.runId && Array.isArray(state.users) && Array.isArray(state.records), "fixture_manifest_invalid");
    ensure(state.records.some((record) => record.id === marker.productId && record.kind === "product" && record.module === "products"), "preview_product_not_in_fixture_ledger");
    ensure(!marker.docxMediaId, "preview_docx_already_exists_use_cleanup");
    staff = state.users.find((fixture) => fixture.role === "staff" && fixture.runId === state.runId);
    ensure(staff?.userId && staff.sessionId, "fixture_staff_missing");
    await verifyFixtureOwnership(context.clerk, staff);

    const insforgeToken = await context.clerk.sessions.getToken(staff.sessionId, "insforge");
    ensure(Boolean(insforgeToken.jwt), "fixture_staff_token_unavailable");
    staffClient = createClient({ baseUrl: context.baseUrl, accessToken: insforgeToken.jwt });
    const capability = await rpc(staffClient, "has_capability", { capability_name: "media.manage" });
    ensure(!capability.error && capability.data === false, "fixture_media_capability_pregranted");

    const readProductResponse = await request(context, `/api/admin/products/${marker.productId}`, async () => (await context.clerk.sessions.getToken(staff.sessionId)).jwt);
    const product = (await responseJson(readProductResponse, 200, "fixture_product_read")).record;
    ensure(product?.kind === "product" && product.id === marker.productId && product.publishedRevisionId === null && !product.archived, "fixture_product_not_unpublished");
    const unchangedVersion = product.version;

    const invalidPort = { ...product.document, richContent: richText("Invalid port fixture", "https://example.com:99999/manual") };
    const invalidPortResult = await rpc(staffClient, "admin_save_record", {
      p_id: product.id, p_kind: "product", p_expected_version: unchangedVersion, p_document: invalidPort,
    });
    ensure(Boolean(invalidPortResult.error), "sql_invalid_href_port_accepted");

    const missingRootContent = { ...product.document, richContent: { type: "doc" } };
    const missingRootResult = await rpc(staffClient, "admin_save_record", {
      p_id: product.id, p_kind: "product", p_expected_version: unchangedVersion, p_document: missingRootContent,
    });
    ensure(Boolean(missingRootResult.error), "sql_rich_doc_without_content_accepted");

    const astral = "Product guide 🤖";
    const validAstral = { ...product.document, richContent: richText(astral) };
    const validResult = await rpc(staffClient, "admin_save_record", {
      p_id: product.id, p_kind: "product", p_expected_version: unchangedVersion, p_document: validAstral,
    });
    ensure(!validResult.error, "sql_astral_rich_text_rejected");
    const normalizedResponse = await request(context, `/api/admin/products/${marker.productId}`, async () => (await context.clerk.sessions.getToken(staff.sessionId)).jwt);
    const normalized = (await responseJson(normalizedResponse, 200, "astral_product_readback")).record;
    ensure(normalized.version === unchangedVersion + 1 && normalized.document.richContent?.content?.[0]?.content?.[0]?.text === astral, "astral_rich_text_did_not_round_trip");

    const grant = await rpc(context.admin, "set_staff_capability", {
      target_user_id: staff.userId,
      capability_name: "media.manage",
      enabled: true,
      reason: `Disposable DOCX upload fixture ${state.runId}`,
    });
    ensure(!grant.error, "fixture_media_capability_grant_failed");
    mediaManageGranted = true;
    const granted = await rpc(staffClient, "has_capability", { capability_name: "media.manage" });
    ensure(!granted.error && granted.data === true, "fixture_media_capability_missing");

    const bytes = await docxFixture();
    const filename = `Phase3 ${state.runId} product manual.docx`;
    const form = new FormData();
    form.set("file", new File([bytes], filename, { type: DOCX_MIME }));
    form.set("altText", `Disposable product manual ${state.runId}`);
    form.set("source", "Synthetic product DOCX integration fixture");
    const uploadResponse = await request(context, "/api/admin/media", async () => (await context.clerk.sessions.getToken(staff.sessionId)).jwt, {
      method: "POST", headers: { origin: context.appOrigin }, body: form,
    });
    const uploaded = (await responseJson(uploadResponse, 201, "docx_media_upload")).media;
    ensure(uploaded?.id && uploaded.mimeType === DOCX_MIME && uploaded.width === null && uploaded.height === null &&
      uploaded.byteSize === bytes.byteLength && uploaded.version === 1 && uploaded.published === false && uploaded.archived === false,
    "docx_upload_metadata_invalid");
    await writePreviewMarker(marker, uploaded.id);

    const revoke = await rpc(context.admin, "set_staff_capability", {
      target_user_id: staff.userId,
      capability_name: "media.manage",
      enabled: false,
      reason: `Revoke disposable DOCX upload fixture ${state.runId}`,
    });
    ensure(!revoke.error, "fixture_media_capability_revoke_failed");
    mediaManageGranted = false;
    const revoked = await rpc(staffClient, "has_capability", { capability_name: "media.manage" });
    ensure(!revoked.error && revoked.data === false, "fixture_media_capability_revoke_unverified");

    const anonKey = process.env.INSFORGE_ANON_KEY?.trim();
    ensure(Boolean(anonKey), "insforge_anon_key_unavailable");
    const publicStorageClient = createClient({
      baseUrl: context.baseUrl,
      anonKey,
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    });
    const publicStorageRead = await publicStorageClient.storage.from(MEDIA_BUCKET).download(`assets/${uploaded.id}.docx`);
    ensure(Boolean(publicStorageRead.error) || !publicStorageRead.data, "anonymous_docx_storage_read_allowed");

    const staffToken = async () => (await context.clerk.sessions.getToken(staff.sessionId)).jwt;
    const staffDownload = await request(context, `/api/media/${uploaded.id}`, staffToken);
    ensure(staffDownload.status === 200, `staff_docx_delivery_status_${staffDownload.status}`);
    ensure(staffDownload.headers.get("content-type") === DOCX_MIME && staffDownload.headers.get("cache-control")?.includes("no-store") &&
      staffDownload.headers.get("content-disposition")?.startsWith("attachment;"), "private_docx_delivery_headers_invalid");
    const deliveredBytes = Buffer.from(await staffDownload.arrayBuffer());
    ensure(deliveredBytes.equals(bytes), "private_docx_delivery_changed_original_bytes");

    const anonymousDownload = await request(context, `/api/media/${uploaded.id}`, null);
    ensure(anonymousDownload.status === 404, "anonymous_docx_media_download_allowed");

    const currentResponse = await request(context, `/api/admin/products/${marker.productId}`, staffToken);
    const current = (await responseJson(currentResponse, 200, "product_read_before_docx_attach")).record;
    ensure(current.publishedRevisionId === null && !current.archived && current.version === normalized.version, "fixture_product_changed_before_docx_attach");
    const attachedDocument = { ...current.document, documentMediaId: uploaded.id };
    const attachResponse = await request(context, `/api/admin/products/${marker.productId}`, staffToken, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: context.appOrigin },
      body: JSON.stringify({ expectedVersion: current.version, document: attachedDocument }),
    });
    const attached = (await responseJson(attachResponse, 200, "product_docx_attach")).record;
    ensure(attached.document.documentMediaId === uploaded.id && attached.version === current.version + 1, "docx_not_attached_to_product_draft");

    console.log("DOCX API upload, private no-store byte delivery, anonymous denial, and SQL/application rich-text parity checks passed without publication.");
  } catch (error) {
    failure = error instanceof HarnessFailure ? error : new HarnessFailure(safeFailureLabel(error));
  } finally {
    if (mediaManageGranted && staff?.userId) {
      const result = await rpc(context.admin, "set_staff_capability", {
        target_user_id: staff.userId,
        capability_name: "media.manage",
        enabled: false,
        reason: `Revoke failed disposable DOCX upload fixture ${state?.runId ?? "unknown"}`,
      });
      if (result.error) failure ??= new HarnessFailure("fixture_media_capability_revoke_failed");
    }
  }

  if (failure) {
    console.error(`Product DOCX integration failed safely: ${failure.label}.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
