import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { createControlRoomHandlers } from "./handlers";
import { createControlRoomStore } from "./insforge-store";
import type { Admission } from "./contracts";
type Client = Awaited<ReturnType<typeof createInsforgeServerClient>>;
type Context = {
    admission: {
        kind: "admin";
    };
    client: Client;
} | {
    admission: Exclude<Admission, {
        kind: "admin";
    }>;
};
async function adminContext(): Promise<Context> {
    try {
        const session = await auth();
        if (!session.isAuthenticated || session.sessionStatus !== "active" || !session.userId) {
            return { admission: { kind: "unauthorized" } };
        }
        const client = await createInsforgeServerClient();
        const { data, error } = await client.database.from("staff_role_memberships")
            .select("role").eq("user_id", session.userId).limit(1);
        if (error || !Array.isArray(data))
            return { admission: { kind: "unavailable" } };
        if (data.length !== 1 || data[0]?.role !== "ADMIN")
            return { admission: { kind: "forbidden" } };
        return { admission: { kind: "admin" }, client };
    }
    catch {
        return { admission: { kind: "unavailable" } };
    }
}
/** Server-page guard; capabilities, browser fields and email are never Admin authority. */
export async function controlRoomAdminAccess(): Promise<{
    allowed: true;
} | {
    allowed: false;
    status: 401 | 403 | 503;
}> {
    const context = await adminContext();
    const kind = context.admission.kind;
    return kind === "admin" ? { allowed: true } : { allowed: false, status: kind === "unauthorized" ? 401 : kind === "forbidden" ? 403 : 503 };
}
function denied(kind: Exclude<Admission["kind"], "admin">): Response {
    return Response.json({ error: { code: kind } }, {
        status: kind === "unauthorized" ? 401 : kind === "forbidden" ? 403 : 503,
        headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
}
type Operation = "overview" | "listIntakes" | "getIntake" | "link" | "upload" | "review" | "caseSets" | "evaluate";
async function dispatch(operation: Operation, request: Request, reference?: string): Promise<Response> {
    const context = await adminContext();
    if (!("client" in context))
        return denied(context.admission.kind);
    // New client and role admission for every request; no process-wide user token or store.
    // Enable only after actual private-bucket/policy validation, never merely to hide an outage.
    const store = createControlRoomStore(context.client, {
        privateUploadEnabled: process.env.PANDA_AGENT_CONTROL_ROOM_UPLOADS_ENABLED === "true",
    });
    const handlers = createControlRoomHandlers(async () => context.admission, store);
    return operation === "getIntake" || operation === "review"
        ? handlers[operation](request, reference ?? "") : handlers[operation](request);
}
export const overviewGET = (request: Request) => dispatch("overview", request);
export const intakesGET = (request: Request) => dispatch("listIntakes", request);
export const intakesPOST = (request: Request) => dispatch("link", request);
export const uploadPOST = (request: Request) => dispatch("upload", request);
export const caseSetsGET = (request: Request) => dispatch("caseSets", request);
export const evaluationsPOST = (request: Request) => dispatch("evaluate", request);
type RouteContext = {
    params: Promise<{
        reference: string;
    }>;
};
export const intakeGET = async (request: Request, context: RouteContext) => dispatch("getIntake", request, (await context.params).reference);
export const reviewPATCH = async (request: Request, context: RouteContext) => dispatch("review", request, (await context.params).reference);
