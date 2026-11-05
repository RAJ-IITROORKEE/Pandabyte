import {diagnosticImageHandlers} from '@/Panda-agent/src/server/diagnostic-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 return diagnosticImageHandlers.uploadPOST(request,(await context.params).id);
}
