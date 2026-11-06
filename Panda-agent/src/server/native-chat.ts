import 'server-only';
import type { ChatActor } from './chat-contracts';
import { createNativeChatService } from './native-chat-service';
import { createNativeRuntimeAdmission } from './native-runtime';
import { readNativeRuntimeFile } from './native-runtime-file';
import { currentLightweightSession } from './lightweight-connection';

// Schema availability and new-message selection are separate; disabling new work never bypasses native recovery.
export function nativeChatForActor(actor: ChatActor) {
    const key = process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? '';
    return createNativeChatService(actor, {
        key,
        current: value => value.sessionId ? currentLightweightSession(value.subject, value.sessionId) : Promise.resolve(false),
        runtime: createNativeRuntimeAdmission({ key, readDescriptor: () => readNativeRuntimeFile(process.env.PANDA_AGENT_NATIVE_RUNTIME_FILE) }),
    });
}
