import { chatHandlers } from '@/Panda-agent/src/server/clerk-chat';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return chatHandlers.messagePOST(request, (await context.params).id);
}
