import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createAnswerHandler } from "./answer-handler";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { createInsforgeAdapters } from "../retrieval/insforge-adapters";
import { localRuntimeSelector } from "./local-runtime";
// The live operator tunnel is admitted only in explicitly enabled local development.
export const POST = createAnswerHandler(async () => {
    const { isAuthenticated, sessionStatus, userId } = await auth();
    return isAuthenticated && sessionStatus === "active" && userId
        ? { subject: userId }
        : null;
}, async (_actor, request) => {
    const select = await localRuntimeSelector();
    if (!select) return null;
    return createInsforgeAdapters(await createInsforgeServerClient(), async (question, fragments) => {
        if (request.signal.aborted) throw new Error('Request ended before model admission');
        return select(question, fragments);
    });
});
