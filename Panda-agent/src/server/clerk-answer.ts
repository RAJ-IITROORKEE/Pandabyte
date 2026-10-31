import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createAnswerHandler } from "./answer-handler";
// No customer runtime is admitted yet. The default null adapter fails closed with
// 503 after authentication and request validation; it never reads provider keys.
export const POST = createAnswerHandler(async () => {
    const { isAuthenticated, sessionStatus, userId } = await auth();
    return isAuthenticated && sessionStatus === "active" && userId
        ? { subject: userId }
        : null;
});
