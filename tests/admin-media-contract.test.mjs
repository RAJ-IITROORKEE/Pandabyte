import test from "node:test";
import assert from "node:assert/strict";
import { parseMediaQuery, parseMediaWorkspace, parseMediaDetail } from "../lib/admin/media-contract.ts";
const id = "11111111-1111-4111-8111-111111111111";
const media = {id,filename:"photo.webp",mimeType:"image/webp",byteSize:10,width:1,height:1,altText:"Photo",source:"",version:1,published:false,archived:false,referenced:true,publicUseAllowed:null,triangles:null,url:`/api/media/${id}`,createdAt:"2026-11-01T00:00:00Z",updatedAt:"2026-11-01T00:00:00Z"};
const stats = {total:1,images:1,documents:0,models:0,published:0,private:1,totalBytes:10};
test("media filters are closed, bounded and backward compatible",()=>{
  assert.deepEqual(parseMediaQuery("http://localhost/api/admin/media?q=photo&limit=50&offset=1000000"),{query:"photo",type:"all",status:"all",sort:"newest",limit:50,offset:1000000});
  for (const suffix of ["type=bad","status=archived","sort=bad","limit=51","offset=1000001","q=x&q=y","extra=1"]) assert.equal(parseMediaQuery(`http://localhost/?${suffix}`),null);
});
test("workspace and detail reject malformed or unsafe backend projections",()=>{
  assert.deepEqual(parseMediaWorkspace({items:[media],total:1,stats}),{items:[media],total:1,stats});
  assert.ok(parseMediaWorkspace({items:[{...media,altText:"Line one\nLine two",source:"Rights\tconfirmed\r\nNext"}],total:1,stats}));
  assert.equal(parseMediaWorkspace({items:[{...media,url:"https://external.example"}],total:1,stats}),null);
  const detail={media,usage:{items:[{title:"Product",kind:"product",slug:"sample",status:"draft",url:"/admin/products/11111111-1111-4111-8111-111111111111"}],total:1,limit:50,truncated:false}};
  assert.deepEqual(parseMediaDetail(detail),detail);
  assert.equal(parseMediaDetail({...detail,usage:{...detail.usage,items:[{...detail.usage.items[0],url:"//evil.example"}]}}),null);
  assert.equal(parseMediaDetail({...detail,usage:{...detail.usage,total:2}}),null);
});
