import {diagnosticImageHandlers} from '@/Panda-agent/src/server/diagnostic-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(request:Request,context:{params:Promise<{id:string;assetId:string}>}){
 const {id,assetId}=await context.params;return diagnosticImageHandlers.readGET(request,id,assetId);
}
export async function DELETE(request:Request,context:{params:Promise<{id:string;assetId:string}>}){
 const {id,assetId}=await context.params;return diagnosticImageHandlers.deleteDELETE(request,id,assetId);
}
