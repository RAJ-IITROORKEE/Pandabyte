import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../lib/admin/media-contract.ts";
import { canAdminPermission } from "../lib/admin/access-contract.ts";
const compile = path => ts.transpileModule(readFileSync(new URL(`../${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(file,{allowed=true,data=null,rpcError=null}={}) {
  const calls=[],exports={};
  runInNewContext(compile(file),{exports,Response,require(name){
    if(name === "node:crypto") return {};
    if(name === "@/lib/authorization") return {getStaffAccess:async()=>allowed?{allowed:true,capabilities:["media.manage"]}:{allowed:false,status:403}};
    if(name === "@/lib/insforge/server") return {createInsforgeServerClient:async()=>({database:{schema:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data,error:rpcError};}})}})};
    if(name === "@/lib/editorial/http") return {editorialError:(code,status)=>Response.json({error:{code}},{status}),editorialJson:value=>Response.json(value),editorialDatabaseError:()=>Response.json({error:{code:"backend_unavailable"}},{status:503})};
    if(name === "@/lib/admin/media-contract") return contract;
    if(name === "@/lib/admin/access-contract") return {canAdminPermission};
    if(name === "@/lib/editorial/validation") return {UUID_PATTERN:/^[0-9a-f-]{36}$/};
    if(["@/lib/storage/http","@/lib/observability/events","@/lib/editorial/media"].includes(name)) return {};
    throw Error(name);
  }});
  return {exports,calls};
}
test("workspace authorizes, validates filters and forwards bounded query",async()=>{
  const data={items:[],total:0,stats:{total:0,images:0,documents:0,models:0,published:0,private:0,totalBytes:0}};
  const h=harness("app/api/admin/media/route.ts",{data});
  const response=await h.exports.GET(new Request("http://localhost/api/admin/media?type=document&status=private&sort=name&limit=10&offset=2"));
  assert.equal(response.status,200); assert.equal(h.calls[0].name,"admin_media_workspace"); assert.equal(h.calls[0].args.p_type,"document");
  assert.equal((await h.exports.GET(new Request("http://localhost/api/admin/media?limit=51"))).status,400); assert.equal(h.calls.length,1);
  const denied=harness("app/api/admin/media/route.ts",{allowed:false}); assert.equal((await denied.exports.GET(new Request("http://localhost"))).status,403); assert.equal(denied.calls.length,0);
});
test("detail rejects invalid IDs and fails closed on bad RPC results",async()=>{
  const h=harness("app/api/admin/media/[id]/route.ts");
  assert.equal((await h.exports.GET(new Request("http://localhost"),{params:Promise.resolve({id:"bad"})})).status,404); assert.equal(h.calls.length,0);
  assert.equal((await h.exports.GET(new Request("http://localhost"),{params:Promise.resolve({id:"11111111-1111-4111-8111-111111111111"})})).status,503); assert.equal(h.calls[0].name,"admin_media_details");
});
