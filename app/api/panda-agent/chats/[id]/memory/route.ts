import { projectMemoryGET, projectMemoryPATCH } from '@/Panda-agent/src/server/project-memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => projectMemoryGET(request, (await context.params).id);
export const PATCH = async (request: Request, context: Context) => projectMemoryPATCH(request, (await context.params).id);
