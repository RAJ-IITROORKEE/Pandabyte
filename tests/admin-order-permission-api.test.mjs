import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/admin/orders/[reference]/route.ts", import.meta.url), "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(allowed) {
  const exports = {}, actions = [], calls = [];
  runInNewContext(compiled, {exports, Response, require(name) {
    if (name === "@/lib/authorization") return {requireOrderPermission: async action => {actions.push(action); return allowed ? {allowed:true,userId:"actor"} : {allowed:false,status:403};}};
    if (name === "@/lib/checkout/http") return {cartError: (_code,status)=>new Response(null,{status}), orderRpc: async name => {calls.push(name); return new Response();}, readCheckoutBody: async()=>({value:{}})};
    if (name === "@/lib/checkout/validation") return {isOrderReference:()=>true,parseAdminOrderUpdate:()=>({expectedVersion:1,status:"processing",shipping:{}})};
    throw Error(name);
  }});
  const context = {params:Promise.resolve({reference:"test"})};
  return {actions,calls,get:()=>exports.GET(new Request("http://localhost"),context),patch:()=>exports.PATCH(new Request("http://localhost",{method:"PATCH"}),context)};
}
test("order detail authorizes the specific read or update action before data access", async()=>{
  const allowed = harness(true); await allowed.get(); await allowed.patch(); assert.deepEqual(allowed.actions,["read","update"]); assert.deepEqual(allowed.calls,["admin_get_checkout_order","admin_update_checkout_order"]);
  const denied = harness(false); assert.equal((await denied.get()).status,403); assert.equal((await denied.patch()).status,403); assert.deepEqual(denied.actions,["read","update"]); assert.deepEqual(denied.calls,[]);
});
