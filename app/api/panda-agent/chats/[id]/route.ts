import { chatHandlers } from '@/Panda-agent/src/server/clerk-chat';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return chatHandlers.readGET(request, (await context.params).id);
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return chatHandlers.archivePATCH(request, (await context.params).id);
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return chatHandlers.deleteDELETE(request, (await context.params).id);
}
