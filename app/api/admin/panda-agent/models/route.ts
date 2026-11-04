import { controlRoomAdminAccess } from '@/Panda-agent/src/control-room/clerk';
import { createModelCatalogHandler } from '@/Panda-agent/src/control-room/model-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createModelCatalogHandler(controlRoomAdminAccess);
