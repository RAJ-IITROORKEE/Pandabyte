import 'server-only';
import { controlRoomAdminAccess } from '../control-room/clerk';
import { createNativeInspectionClient } from './inspection-client';
import { createRuntimeInspectionHandler } from './inspection-handler';

// Read-only development discovery. Customer execution remains on its current path.
export const nativeInspectionGET = createRuntimeInspectionHandler(
  controlRoomAdminAccess,
  async signal => {
    if (process.env.PANDA_AGENT_OPENCODE_INSPECTION_ENABLED !== 'true') throw Error('Runtime unavailable');
    const client = createNativeInspectionClient({
      baseUrl: process.env.PANDA_AGENT_OPENCODE_URL ?? '',
      password: process.env.PANDA_AGENT_OPENCODE_PASSWORD ?? '',
    });
    return client.inspect(signal);
  },
);
