import assert from "node:assert/strict";
import test from "node:test";
import { parsePublishedRecord, parsePublicVariant } from "../lib/editorial/public-record.ts";
import { parseDocument } from "../lib/admin/validation.ts";
const id = "fdb5682c-c8f4-4c8e-a6fe-3fb15ccac700";
const doc = {title:"Published",slug:"published",summary:"Public",seoTitle:"",seoDescription:""};
test("published list projection restores empty blocks and rejects private/malformed DTOs", () => {
  const record = {id,kind:"blog",revisionId:id,publishedAt:"2026-10-24T00:00:00Z",document:{...doc,author:"",tags:[],mediaIds:[]}};
  assert.deepEqual(parsePublishedRecord("blog",record).document.blocks,[]);
  for(const patch of [{kind:"page"},{id:"private"},{publishedAt:"not a date"},{document:{...record.document,role:"staff"}}]) assert.throws(()=>parsePublishedRecord("blog",{...record,...patch}));
});
test("published category records retain legacy blocks and accept validated rich content", () => {
  const legacy = [{ type: "paragraph", text: "Legacy category copy" }];
  const richContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Formatted category copy" }] }] };
  const imageId = "5ed02229-2e4b-4bd4-a887-9322f1c30dd9";
  const category = parsePublishedRecord("categories", {
    id, kind: "category", revisionId: id, publishedAt: "2026-10-24T00:00:00Z",
    document: { ...doc, parentId: null, position: 0, mediaIds: [imageId], blocks: legacy, richContent },
  });
  assert.deepEqual(category.document.mediaIds, [imageId]);
  assert.equal(category.summary, "Public");
  assert.deepEqual(category.document.blocks, legacy);
  assert.deepEqual(category.document.richContent, richContent);
  assert.throws(() => parsePublishedRecord("categories", {
    id, kind: "category", revisionId: id, publishedAt: "2026-10-24T00:00:00Z",
    document: { ...category.document, richContent: { type: "doc", content: [{ type: "image", attrs: { mediaId: id, alt: "Photo", src: "https://example.com/photo.webp" } }] } },
  }));
});
test("public prices are bounded coherent paise without stock count fields", () => {
  const variant={id,sku:"X-C6",label:"Board",regularPricePaise:10000,effectivePricePaise:8000,isOnSale:true,saleEndsAt:"2026-11-01T00:00:00Z",availability:"available",stock:100};
  assert.equal(parsePublicVariant(variant).effectivePricePaise,8000);
  assert.equal(parsePublicVariant({...variant,saleEndsAt:null}).isOnSale,true);
  assert.equal("stock" in parsePublicVariant(variant),false);
  for(const patch of [{effectivePricePaise:1.1},{effectivePricePaise:10001},{saleEndsAt:null,effectivePricePaise:10000},{saleEndsAt:null,effectivePricePaise:null},{availability:"infinite"},{isOnSale:false}]) assert.throws(()=>parsePublicVariant({...variant,...patch}));
});
test("models and resource collections remain editable and backward compatible", () => {
  const product={...doc,categoryIds:[],variants:[],specifications:[],compatibility:[],kitContents:[],resources:[],mediaIds:[]};
  assert.deepEqual(parseDocument("products",product).value.modelNumbers,[]);
  assert.deepEqual(parseDocument("products",{...product,modelNumbers:["ESP32-C6","xS3"]}).value.modelNumbers,["ESP32-C6","xS3"]);
  for(const models of [["---"],["C6","c6"],Array(21).fill("model"),["C6\nx"]]) assert.equal(parseDocument("products",{...product,modelNumbers:models}).ok,false);
  const resource={...doc,url:"https://example.com/resource",productIds:[],position:0};
  assert.equal(parseDocument("learn",resource).value.collection,"embedded-systems");
  assert.equal(parseDocument("learn",{...resource,collection:"kit-guides"}).ok,true);
  for(const collection of ["private",null,3]) assert.equal(parseDocument("learn",{...resource,collection}).ok,false);
});

test("published copy and sanitized hidden core overrides survive typed projections", () => {
  const base = {id,revisionId:id,publishedAt:"2026-10-26T00:00:00Z"};
  const contact = parsePublishedRecord("contact", {...base,kind:"contact",document:{...doc,slug:"contact",supportTitle:"Support",supportText:"Reviewed text",footerTagline:"Brand text",copyrightName:"Company"}});
  assert.equal(contact.document.supportText,"Reviewed text");
  const nav = parsePublishedRecord("navigation", {...base,kind:"navigation",document:{...doc,slug:"primary",links:[{label:"Hidden navigation link",href:"/contact",group:"header",position:0,visible:false}]}});
  assert.equal(nav.document.links[0].visible,false);
  assert.throws(()=>parsePublishedRecord("contact", {...base,kind:"contact",document:{...contact.document,sourceReview:["Private review"]}}));
});
