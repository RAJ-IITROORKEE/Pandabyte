import 'server-only';
import { controlRoomAdminAccess } from '../control-room/clerk';
import { createNativeRuntimeAdmission } from '../server/native-runtime';
import { readNativeRuntimeFile } from '../server/native-runtime-file';
import { createRuntimeInspectionHandler } from './inspection-handler';

// Read-only development discovery. Customer execution remains on its current path.
export const nativeInspectionGET = createRuntimeInspectionHandler(
  controlRoomAdminAccess,
  async signal => {
    if (process.env.PANDA_AGENT_OPENCODE_INSPECTION_ENABLED !== 'true') throw Error('Runtime unavailable');
    const admission = createNativeRuntimeAdmission({
      key: process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '',
      readDescriptor: () => readNativeRuntimeFile(process.env.PANDA_AGENT_NATIVE_RUNTIME_FILE),
      // Discovery allows fresh Windows ACL subprocesses on both sides of each identity check.
      timeoutMs: 10000,
    });
    const result = await admission.inspect(signal);
    if (!result) throw Error('Runtime unavailable');
    return result;
  },
);
