import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { preflight, createFixtures, verifyFixtureOwnership, cleanFixtures, appRequest } from "./phase2-isolation.mjs";

const path = new URL("../.bootstrap/media-workspace-fixtures.json", import.meta.url);
const directory = new URL("../.bootstrap/", import.meta.url);
const context = await preflight();
const table = (client, name) => client.database.schema("public").from(name);
const rpc = (client, name, args = {}) => client.database.schema("public").rpc(name, args);
let state;
function save() { mkdirSync(directory,{recursive:true}); writeFileSync(path,JSON.stringify(state)); }
async function remove(name,column,values) {
  if (!values.length) return;
  const result=await table(context.admin,name).delete().in(column,values); assert.equal(result.error,null,`cleanup_${name}`);
}
async function cleanup() {
  for (const user of state.users) await verifyFixtureOwnership(context.clerk,user);
  const ids=state.users.map(user=>user.userId);
  const actor=state.users.find(user=>user.role === "staff")?.userId;
  const records=actor ? await table(context.admin,"cms_records").select("id,created_by,slug,published_revision_id").eq("created_by",actor).eq("slug",`media-check-${state.runId}`) : {data:[],error:null};
  assert.equal(records.error,null); assert.ok(records.data.every(row=>row.created_by===actor && row.published_revision_id===null));
  const media=actor ? await table(context.admin,"cms_media").select("id,object_key,created_by,source,published").eq("created_by",actor).eq("source",`media-check-${state.runId}`) : {data:[],error:null};
  assert.equal(media.error,null); assert.ok(media.data.every(row=>row.created_by===actor && row.source===`media-check-${state.runId}` && !row.published && /^assets\/[0-9a-f-]{36}\.webp$/.test(row.object_key)));
  const roleResult=await table(context.admin,"staff_role_definitions").select("key,name,built_in").eq("name",`Media check ${state.runId}`);
  assert.equal(roleResult.error,null); assert.ok(roleResult.data.every(row=>!row.built_in && row.key.startsWith("custom_")));
  const roleKeys=roleResult.data.map(row=>row.key);
  if(roleKeys.length) { const members=await table(context.admin,"staff_role_memberships").select("user_id").in("role",roleKeys); assert.equal(members.error,null); assert.ok(members.data.every(row=>ids.includes(row.user_id))); }
  await remove("cms_audit_events","entity_id",records.data.map(row=>row.id));
  await remove("cms_records","id",records.data.map(row=>row.id));
  await remove("editorial_media_events","media_id",media.data.map(row=>row.id));
  for(const row of media.data) { const result=await context.admin.storage.from("editorial-media").remove(row.object_key); assert.ok(!result.error || result.error.statusCode===404); }
  await remove("cms_media","id",media.data.map(row=>row.id));
  await remove("staff_role_memberships","user_id",ids);
  await remove("staff_role_events","user_id",ids);
  await remove("staff_capability_events","user_id",ids);
  await remove("staff_role_definition_events","role_key",roleKeys);
  await remove("staff_role_definitions","key",roleKeys);
  await cleanFixtures(context,state.users,state.runId);
  await unlink(path);
}
if(process.argv.includes("--cleanup")) { state=JSON.parse(await readFile(path)); await cleanup(); console.log("Disposable media fixtures cleaned."); }
else {
  try { await readFile(path); throw Error("Existing fixture state requires --cleanup first."); } catch(error) { if(error.code!=="ENOENT") throw error; }
  state={runId:randomUUID(),users:[]}; save();
  try {
    const fixture=await createFixtures(context.clerk,state.runId,user=>{state.users.push(user);save();}); save();
    const actor=state.users.find(user=>user.role==="staff"), target=state.users.find(user=>user.role==="customer");
    const adminDb=fixture.auth.staff.database, readerDb=fixture.auth.customer.database;
    assert.equal((await rpc(context.admin,"project_admin_set_staff_role",{p_user_id:actor.userId,p_role:"ADMIN",p_protected:false,p_reason:`Disposable media ${state.runId}`})).error,null);
    async function request(path,who="staff",opts={}) { return appRequest(context.appOrigin,path,who ? fixture.auth[who].appToken : null,opts); }
    async function json(path,who="staff",body,method="POST") { const response=await request(path,who,{method,headers:{origin:context.appOrigin,"content-type":"application/json"},body:JSON.stringify(body)}); return {response,body:await response.json()}; }
    async function upload(who,file,origin=context.appOrigin) { const form=new FormData();form.set("file",file);form.set("altText","Disposable media check");form.set("source",`media-check-${state.runId}`);return request("/api/admin/media",who,{method:"POST",headers:{origin},body:form}); }
    assert.equal((await request("/api/admin/media",null)).status,401);
    assert.equal((await request("/api/admin/media","customer")).status,403);
    assert.ok((await rpc(readerDb,"admin_media_workspace",{p_query:"",p_type:"all",p_status:"all",p_sort:"newest",p_limit:10,p_offset:0})).error);
    const definition=await json("/api/admin/role-definitions","staff",{key:null,name:`Media check ${state.runId}`,description:"Disposable role",permissions:["media.read"],expectedVersion:0,reason:"Disposable media verification"}); assert.equal(definition.response.status,200);
    assert.equal((await json("/api/admin/roles","staff",{email:target.email,targetUserId:target.userId,role:definition.body.role.key,expectedVersion:0,reason:"Disposable media verification"})).response.status,200);
    const bytes=await sharp({create:{width:2,height:2,channels:3,background:"#009960"}}).webp().toBuffer();
    const file=()=>new File([bytes],`media-check-${state.runId}.webp`,{type:"image/webp"});
    assert.equal((await upload("staff",new File(["invalid"],"bad.webp",{type:"image/webp"}))).status,400);
    assert.equal((await upload("staff",file(),"https://unrelated.invalid")).status,403);
    const uploaded=await upload("staff",file()); assert.equal(uploaded.status,201); const item=(await uploaded.json()).media;
    const id=item.id;
    assert.equal((await request(`/api/media/${id}`,null)).status,404);
    const workspace=await request(`/api/admin/media?q=${encodeURIComponent(state.runId)}&type=image&status=private&sort=name`); assert.equal(workspace.status,200); const list=await workspace.json(); assert.equal(list.total,1); assert.equal(list.items[0].id,id); assert.ok(list.stats.total>=1 && list.stats.images>=1 && list.stats.private>=1 && list.stats.totalBytes>=item.byteSize);
    assert.equal((await request(`/api/admin/media?q=${state.runId}&type=document`)).status,200); assert.equal((await (await request(`/api/admin/media?q=${state.runId}&type=document`)).json()).total,0);
    assert.equal((await request("/api/admin/media?type=invalid")).status,400);
    const invalid=await rpc(adminDb,"admin_media_workspace",{p_query:"",p_type:"bad",p_status:"all",p_sort:"newest",p_limit:10,p_offset:0}); assert.ok(invalid.error);
    const patch={expectedVersion:item.version,altText:"Updated disposable image",source:`media-check-${state.runId}`,published:false};
    const updated=await json(`/api/admin/media/${id}`,"staff",patch,"PATCH"); assert.equal(updated.response.status,200); assert.equal((await json(`/api/admin/media/${id}`,"staff",patch,"PATCH")).response.status,409);
    assert.equal((await rpc(readerDb,"admin_media_workspace",{p_query:"",p_type:"all",p_status:"all",p_sort:"newest",p_limit:10,p_offset:0})).error,null);
    assert.equal((await rpc(readerDb,"admin_media_details",{p_id:id})).error,null);
    assert.equal((await request(`/api/admin/media/${id}`,"customer")).status,200);
    assert.equal((await request("/api/admin/media","customer")).status,200);
    assert.equal((await json(`/api/admin/media/${id}`,"customer",{...patch,expectedVersion:updated.body.media.version},"PATCH")).response.status,403);
    assert.equal((await upload("customer",file())).status,403);
    assert.equal((await json(`/api/admin/media/${id}/archive`,"customer",{expectedVersion:updated.body.media.version})).response.status,403);
    assert.ok((await rpc(readerDb,"admin_update_media",{p_id:id,p_expected_version:updated.body.media.version,p_alt:"Denied",p_source:"",p_published:false,p_archive:false})).error);
    const document={title:"Disposable media reference",slug:`media-check-${state.runId}`,summary:"Temporary draft",seoTitle:"Temporary draft",seoDescription:"Temporary draft",blocks:[],author:"Test",tags:[],mediaIds:[id]};
    const draft=await rpc(adminDb,"admin_save_record",{p_id:null,p_kind:"blog",p_expected_version:null,p_document:document}); assert.equal(draft.error,null);
    const detail=await (await request(`/api/admin/media/${id}`)).json(); assert.equal(detail.media.referenced,true); assert.ok(detail.usage.items.some(entry=>entry.title===document.title));
    const hidden=await (await request(`/api/admin/media/${id}`,"customer")).json(); assert.equal(hidden.media.referenced,true); assert.equal(hidden.usage.total,0); assert.equal(hidden.usage.items.length,0);
    assert.equal((await json(`/api/admin/media/${id}/archive`,"staff",{expectedVersion:updated.body.media.version})).response.status,409);
    const publicAsset=await table(context.admin,"cms_media").select("id").eq("published",true).eq("archived",false).limit(1); assert.equal(publicAsset.error,null);
    if(publicAsset.data.length) assert.equal((await request(`/api/media/${publicAsset.data[0].id}`,null)).status,200); else console.log("No existing public media available for anonymous delivery check.");
    console.log("Media workspace filters, permissions, private uploads and bounded usage checks passed.");
  } finally { save(); await cleanup(); }
}
