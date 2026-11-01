import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseUserRemovalInput, validUserId } from "../lib/admin/access-contract.ts";
const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/users/[id]/route.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({ current = null, manager = true, initialMissing = false, deleteFailure = false, missingAfterDelete = false, prepareError = null, prepareThrows = false, prepareState = "pending", finishError = false } = {}) {
  const exports = {}, calls = []; let reads = 0;
  const db = { rpc: async (name) => { calls.push(name); if (name === "staff_can_manage_roles") return {data:manager}; if (name === "staff_user_removal_state") return {data:{state:current}}; if (name === "staff_prepare_user_removal") { if (prepareThrows) throw Error("unknown"); return prepareError ? {error:{details:prepareError}} : {data:{state:prepareState}}; } if (name === "staff_finish_user_removal") return finishError ? {error:{}} : {data:{state:"deleted"}}; throw Error(name); } };
  runInNewContext(source, {exports, TextDecoder, Response, require(name) {
    if (name === "server-only") return {};
    if (name === "@clerk/nextjs/server") return {auth:async()=>({isAuthenticated:true,sessionStatus:"active",userId:"actor"}), clerkClient:async()=>({users:{getUser:async()=>{ calls.push("getUser"); if (reads++ === 0 ? initialMissing : missingAfterDelete) throw {status:404}; return {}; },deleteUser:async()=>{ calls.push("deleteUser"); if (deleteFailure) throw Error("unknown"); }}})};
    if (name === "@/lib/insforge/server") return {createInsforgeServerClient:async()=>({database:{schema:()=>db}})};
    if (name === "@/lib/observability/events") return {operationalJson:(value,status,headers)=>Response.json(value,{status,headers})};
    if (name === "@/lib/storage/http") return {isSameOriginRequest:()=>true,readBoundedBody:async(request)=>({ok:true,bytes:new Uint8Array(await request.arrayBuffer())})};
    if (name === "@/lib/admin/access-contract") return {parseUserRemovalInput,validUserId};
    throw Error(name);
  }});
  return {calls, run: () => exports.DELETE(new Request("http://localhost/api/admin/users/user_123",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:0,reason:"Requested removal"})}),{params:Promise.resolve({id:"user_123"})})};
}
test("removal stages before deleting and finishes only after provider deletion", async()=>{
  const h=harness(); const response=await h.run(); assert.equal(response.status,200); assert.deepEqual(h.calls,["staff_can_manage_roles","staff_user_removal_state","getUser","staff_prepare_user_removal","deleteUser","staff_finish_user_removal"]);
});
test("pending removals reconcile missing identity and uncertain deletes safely", async()=>{
  const h=harness({current:"pending",initialMissing:true}); assert.equal((await h.run()).status,200); assert.equal(h.calls.includes("deleteUser"),false);
  const uncertain=harness({deleteFailure:true}); const result=await uncertain.run(); assert.equal(result.status,503); assert.equal((await result.json()).error.code,"removal_pending"); assert.equal(uncertain.calls.includes("staff_finish_user_removal"),false);
  const completed=harness({deleteFailure:true,missingAfterDelete:true}); assert.equal((await completed.run()).status,200); assert.equal(completed.calls.at(-1),"staff_finish_user_removal");
  const finishFailure=harness({finishError:true}); assert.equal((await finishFailure.run()).status,503);
});
test("removal protects missing, forbidden, and version-conflicted users", async()=>{
  const absent=harness({initialMissing:true}); assert.equal((await absent.run()).status,404); assert.equal(absent.calls.includes("staff_prepare_user_removal"),false);
  const denied=harness({manager:false}); assert.equal((await denied.run()).status,403); assert.equal(denied.calls.length,1);
  const conflict=harness({prepareError:"version_conflict"}); assert.equal((await conflict.run()).status,409); assert.equal(conflict.calls.includes("deleteUser"),false);
  const deleted=harness({current:"deleted",prepareState:"deleted"}); assert.equal((await deleted.run()).status,200); assert.equal(deleted.calls.includes("deleteUser"),true);
  const alreadyMissing=harness({current:"deleted",initialMissing:true}); assert.equal((await alreadyMissing.run()).status,200); assert.equal(alreadyMissing.calls.includes("deleteUser"),false);
  const unknown=harness({prepareThrows:true}); const unknownResponse=await unknown.run(); assert.equal(unknownResponse.status,503); assert.equal((await unknownResponse.json()).error.code,"backend_unavailable");
  const staged=harness({current:"pending",prepareThrows:true}); const stagedResponse=await staged.run(); assert.equal((await stagedResponse.json()).error.code,"removal_pending");
});
