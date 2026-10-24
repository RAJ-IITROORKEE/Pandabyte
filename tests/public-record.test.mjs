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
test("public prices are bounded coherent paise without stock count fields", () => {
  const variant={id,sku:"X-C6",label:"Board",regularPricePaise:10000,effectivePricePaise:8000,isOnSale:true,saleEndsAt:"2026-11-01T00:00:00Z",availability:"available",stock:100};
  assert.equal(parsePublicVariant(variant).effectivePricePaise,8000);
  assert.equal("stock" in parsePublicVariant(variant),false);
  for(const patch of [{effectivePricePaise:1.1},{effectivePricePaise:10001},{saleEndsAt:null},{availability:"infinite"},{isOnSale:false}]) assert.throws(()=>parsePublicVariant({...variant,...patch}));
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
