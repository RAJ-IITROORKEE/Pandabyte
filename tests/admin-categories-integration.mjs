import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRequest, createFixtures, ensure, preflight, safeJson, verifyFixtureOwnership } from "./phase2-isolation.mjs";
import { ensureOwnedCleanup } from "./phase3-publishing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".bootstrap", "admin-categories");
const tracker = path.join(work, "fixtures.json");
const preview = path.join(work, "preview.json");
function label(error) { return /^[a-z0-9_]{1,180}$/.test(error?.label ?? "") ? error.label : "category_integration_failed"; }
async function rpc(client, name, args) { try { return await client.database.schema("public").rpc(name, args); } catch { return { error: true }; } }
async function request(context, token, route, method="GET", value) {
  const headers = new Headers();
  if (value !== undefined) { headers.set("content-type", "application/json"); headers.set("origin", context.appOrigin); }
  return appRequest(context.appOrigin, route, token, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
}
async function read(response, status, code) { ensure(response.status===status, `${code}_status_${response.status}`); return safeJson(response, `${code}_json`); }
async function checkpoint(state) { await mkdir(work,{recursive:true}); await writeFile(tracker, JSON.stringify(state,null,2)); }
async function cleanup(context,state) {
  for (const user of state.users) await verifyFixtureOwnership(context.clerk,user);
  await ensureOwnedCleanup(context,state);
  await unlink(tracker).catch(e=>{if(e.code!=="ENOENT")throw e;});
  await unlink(preview).catch(e=>{if(e.code!=="ENOENT")throw e;});
}
function document(runId,index) {
  return {title:`Phase3 ${runId} Category ${String(index).padStart(2,"0")}`,slug:`p3-${runId.slice(0,8)}-category-${index}`,summary:`Disposable category fixture ${runId}.`,blocks:[],seoTitle:"",seoDescription:"",parentId:null,position:index,mediaIds:[]};
}
async function verify(context,state,fixtures) {
  const staff=fixtures.auth.staff, customer=fixtures.auth.customer;
  const route="/api/admin/categories/table";
  ensure((await request(context,undefined,route)).status===401,"category_anonymous_allowed");
  ensure((await request(context,customer.appToken,route)).status===403,"category_customer_allowed");
  ensure((await request(context,staff.appToken,route)).status===403,"category_ungranted_staff_allowed");
  const denied=await rpc(customer.database,"admin_list_categories",{p_query:"",p_status:"all",p_sort:"title_asc",p_limit:10,p_offset:0});
  ensure(Boolean(denied.error),"category_rpc_customer_allowed");
  for(const capability of ["catalog.edit","content.publish"]) {
    const granted=await rpc(context.admin,"set_staff_capability",{target_user_id:state.staffUserId,capability_name:capability,enabled:true,reason:`category fixture ${state.runId}`});
    ensure(!granted.error,"category_fixture_grant_failed");
  }
  const records=[];
  for(let index=0;index<11;index++) {
    const created=await read(await request(context,staff.appToken,"/api/admin/categories","POST",{document:document(state.runId,index)}),201,"category_create");
    records.push(created.record);state.records.push({id:created.record.id,module:"categories",kind:"category",slug:created.record.slug});await checkpoint(state);
  }
  const q=`q=${state.runId}&status=draft&sort=title_asc&limit=10`;
  const firstResponse=await request(context,staff.appToken,`${route}?${q}&offset=0`);
  ensure(firstResponse.headers.get("cache-control")?.includes("no-store"),"category_response_cached");
  const first=await read(firstResponse,200,"category_page_one");
  ensure(first.total===11&&first.items.length===10&&first.items[0].title===records[0].title,"category_first_page_or_sort_invalid");
  ensure(first.items.every(r=>r.productCount===0&&r.parent===null&&Number.isInteger(r.position)&&r.status==="draft"),"category_row_projection_invalid");
  const second=await read(await request(context,staff.appToken,`${route}?${q}&offset=10`),200,"category_page_two");
  ensure(second.items.length===1&&second.items[0].id===records[10].id,"category_second_page_invalid");
  const descending=await read(await request(context,staff.appToken,`${route}?q=${state.runId}&sort=position_desc&limit=10`),200,"category_position_sort");
  ensure(descending.items[0].position===10,"category_position_sort_invalid");
  for(const query of ["sort=unknown","q=x&q=y","limit=1","offset=10001","status=unknown","debug=1"]) ensure((await request(context,staff.appToken,`${route}?${query}`)).status===400,"category_invalid_query_allowed");
  const changed={...records[3].document,summary:"Verified category edit."};
  const updated=await read(await request(context,staff.appToken,`/api/admin/categories/${records[3].id}`,"PATCH",{expectedVersion:records[3].version,document:changed}),200,"category_update");
  ensure(updated.record.document.summary===changed.summary&&updated.record.version>records[3].version,"category_update_missing");
  ensure((await request(context,staff.appToken,`/api/admin/categories/${records[3].id}`,"PATCH",{expectedVersion:records[3].version,document:changed})).status===409,"category_stale_update_allowed");
  const child={...records[1].document,parentId:records[0].id};
  await read(await request(context,staff.appToken,`/api/admin/categories/${records[1].id}`,"PATCH",{expectedVersion:records[1].version,document:child}),200,"category_parent_update");
  const related=await read(await request(context,staff.appToken,`${route}?q=${encodeURIComponent(records[1].slug)}&limit=10`),200,"category_parent_projection");
  ensure(related.items[0]?.parent?.id===records[0].id&&related.items[0].parent.title===records[0].title,"category_parent_label_invalid");
  ensure((await request(context,staff.appToken,`/api/admin/categories/${records[0].id}/archive`,"POST",{expectedVersion:records[0].version})).status===409,"category_with_child_archived");
  ensure((await request(context,staff.appToken,`/api/admin/categories/${records[2].id}/archive`,"POST",{expectedVersion:999})).status===409,"category_stale_archive_allowed");
  const archived=await read(await request(context,staff.appToken,`/api/admin/categories/${records[2].id}/archive`,"POST",{expectedVersion:records[2].version}),200,"category_archive");
  ensure(archived.record.archived===true&&archived.record.publishedRevisionId===null,"category_archive_state_invalid");
  const filtered=await read(await request(context,staff.appToken,`${route}?q=${state.runId}&status=archived&limit=10`),200,"category_archive_filter");
  ensure(filtered.total===1&&filtered.items[0]?.id===records[2].id&&filtered.items[0].status==="archived","category_archive_filter_invalid");
  const empty=await read(await request(context,staff.appToken,`${route}?q=${state.runId}&status=published&limit=10`),200,"category_empty_filter");
  ensure(empty.total===0&&empty.items.length===0,"category_empty_filter_invalid");
  state.previewCategoryId=records[3].id;state.parentCategoryId=records[0].id;
  await checkpoint(state);
}
async function main() {
  const arg=process.argv.slice(2);ensure(arg.length<=1&&(!arg.length||["--cleanup","--keep-fixtures"].includes(arg[0])),"category_invalid_arguments");
  const context=await preflight();
  if(arg[0]==="--cleanup") {const state=JSON.parse(await readFile(tracker,"utf8"));ensure(/^[0-9a-f-]{36}$/.test(state.runId)&&state.users?.length===2&&Array.isArray(state.records),"category_fixture_invalid");await cleanup(context,state);console.log("Owned category fixtures and temporary grants removed.");return;}
  try {await readFile(tracker);throw {label:"category_fixture_tracker_exists"};} catch(e) {if(e.code!=="ENOENT")throw e;}
  const state={runId:randomUUID(),users:[],staffUserId:"",records:[],variants:[],media:[],storageKeys:[],inquiries:[]};
  let failure;
  try {
    const fixtures=await createFixtures(context.clerk,state.runId,user=>state.users.push(user));state.users=fixtures.users;state.staffUserId=state.users.find(u=>u.role==="staff").userId;await checkpoint(state);
    await verify(context,state,fixtures);
    if(arg[0]==="--keep-fixtures")await writeFile(preview,JSON.stringify({runId:state.runId,categoryId:state.previewCategoryId,parentCategoryId:state.parentCategoryId},null,2));
    console.log("Category query, parent/count projection, pagination, guarded create/edit/archive, permissions and dependency checks passed without publication.");
  } catch(e) {failure=e;}
  finally {if(state.users.length&&arg[0]!=="--keep-fixtures")try {await cleanup(context,state);}catch(e){await checkpoint(state);failure??=e;}}
  if(failure)throw failure;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(`Category integration stopped safely: ${label(error)}.`);process.exitCode=1;});
