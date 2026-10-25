import { editorialAccess, editorialBody, editorialDatabaseError, editorialError, editorialJson } from "@/lib/editorial/http";
import { UUID_PATTERN } from "@/lib/editorial/validation";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import { dispatchInquiryNotification, NotificationDatabaseError, notificationSettings, parseNotificationRequest } from "@/lib/contact/notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await editorialAccess("inquiries.manage");
  if (access instanceof Response) return access;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return editorialError("not_found", 404);
  const body = await editorialBody(request, 1024);
  if (body instanceof Response) return body;
  const input = parseNotificationRequest(body.value);
  if (!input) return editorialError("invalid_notification", 400);
  const config = notificationSettings(process.env);
  if (!config) return editorialError("notification_unconfigured", 503);
  try {
    const client = await createInsforgeServerClient();
    await dispatchInquiryNotification(client.database, id, input.expectedVersion, config.key, () => client.emails.send({
      to: config.to, from: "PandaByte", subject: "New PandaByte inquiry",
      html: "<p>A new inquiry is waiting in your PandaByte Admin inbox.</p><p>Sign in to your admin workspace to review it.</p>",
    }));
    const result = await client.database.schema("public").rpc("admin_get_inquiry", { p_id: id });
    return result.error ? editorialDatabaseError(result.error) : editorialJson({ ...result.data, notificationAvailable: true });
  } catch (error) {
    return error instanceof NotificationDatabaseError ? editorialDatabaseError(error) : editorialError("notification_unavailable", 503);
  }
}
